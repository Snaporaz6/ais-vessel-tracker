import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryRepository, type Table } from "../storage/repository.js";
import { FileObjectStore } from "../storage/object-store.js";
import { backup, restore } from "../storage/backup.js";
import { unknownVessel } from "../server/live-store.js";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";

// Exercise serial allocation and an ambiguous partial batch commit, as a real
// database does; the regular memory adapter has no serial column defaults.
class SerialRepository extends MemoryRepository {
  private serial = 1;
  calls = 0;
  failSanctions = false;
  override async upsert(table: Table, rows: unknown[]) {
    this.calls++;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] as Record<string, unknown>;
      const serialTable = table === "sanctions" || table === "anomaly_events";
      const existing =
        table === "anomaly_events"
          ? this.data.anomaly_events.find((r) => r.event_key === row.event_key)
          : null;
      await super.upsert(table, [
        {
          ...row,
          ...(serialTable && !row.id
            ? { id: existing?.id ?? this.serial++ }
            : {}),
        },
      ]);
      if (table === "sanctions" && this.failSanctions && i === 1) {
        this.failSanctions = false;
        throw new Error("REQUEST_FAILED_AFTER_PARTIAL_COMMIT");
      }
    }
  }
}

async function fixture() {
  const root = mkdtempSync(join(tmpdir(), "ais-restore-session-"));
  const objects = new FileObjectStore(join(root, "objects"));
  const source = new MemoryRepository();
  const at = "2026-10-04T12:00:00.000Z";
  source.data.vessels = [unknownVessel("900000001")];
  source.data.anomaly_events = [
    {
      id: 998,
      event_key: null,
      mmsi: "900000001",
      type: "dark_activity",
      detected_at: at,
      details: { b: 2, a: 1 },
    },
  ];
  source.data.sanctions = [70, 71, 72].map((id) => ({
    id,
    mmsi: "900000001",
    imo: null,
    name: "Fixture",
    source: "OFAC",
    listed_at: at,
    details_json: { label: "Same duplicate row" },
  }));
  source.data.import_states = [
    {
      source: "OFAC",
      updated_at: at,
      attempted_at: at,
      last_error: null,
      record_count: 3,
    },
  ];
  const result = await backup(source, objects);
  return {
    root,
    objects,
    source,
    result,
    data: await objects.get(result.key),
    options: {
      sessionPath: join(root, "restore-session.json"),
      target: "isolated-project",
    },
  };
}

test("restore resumes the same verified session after a partial commit without duplicating serial rows", async () => {
  const f = await fixture(),
    target = new SerialRepository();
  target.failSanctions = true;
  await assert.rejects(
    restore(target, f.objects, f.data, f.result.checksum, f.options),
    /REQUEST_FAILED_AFTER_PARTIAL_COMMIT/,
  );
  assert.equal(target.data.vessels.length, 1);
  assert.equal(target.data.sanctions.length, 2);
  const eventKey = target.data.anomaly_events[0].event_key;
  assert.match(eventKey, /^[a-f0-9-]{36}$/);
  assert.notEqual(target.data.anomaly_events[0].id, 998);
  await restore(target, f.objects, f.data, f.result.checksum, f.options);
  assert.equal(target.data.sanctions.length, 3);
  assert.equal(new Set(target.data.sanctions.map((r) => r.id)).size, 3);
  assert.equal(target.data.anomaly_events.length, 1);
  assert.equal(target.data.anomaly_events[0].event_key, eventKey);
  assert.equal(
    JSON.parse(readFileSync(f.options.sessionPath, "utf8")).phase,
    "complete",
  );
  const calls = target.calls;
  await restore(target, f.objects, f.data, f.result.checksum, f.options);
  assert.equal(target.calls, calls);
});

test("restore refuses an unowned populated target and a session for a different target or backup", async () => {
  const f = await fixture(),
    target = new SerialRepository();
  await target.upsert("vessels", [unknownVessel("900000999")]);
  await assert.rejects(
    restore(target, f.objects, f.data, f.result.checksum, f.options),
    /RESTORE_REQUIRES_EMPTY_TARGET/,
  );
  assert.equal(existsSync(f.options.sessionPath), false);
  const clean = new SerialRepository();
  clean.failSanctions = true;
  await assert.rejects(
    restore(clean, f.objects, f.data, f.result.checksum, f.options),
  );
  const calls = clean.calls;
  await assert.rejects(
    restore(clean, f.objects, f.data, f.result.checksum, {
      ...f.options,
      target: "other-project",
    }),
    /RESTORE_SESSION_MISMATCH/,
  );
  const changed = await backup(new MemoryRepository(), f.objects);
  await assert.rejects(
    restore(
      clean,
      f.objects,
      await f.objects.get(changed.key),
      changed.checksum,
      f.options,
    ),
    /RESTORE_SESSION_MISMATCH/,
  );
  assert.equal(clean.calls, calls);
});

test("restore refuses changed destination rows before resuming any writes", async () => {
  const f = await fixture(),
    target = new SerialRepository();
  target.failSanctions = true;
  await assert.rejects(
    restore(target, f.objects, f.data, f.result.checksum, f.options),
  );
  target.data.vessels[0].name = "Newer data, must not overwrite";
  const calls = target.calls;
  await assert.rejects(
    restore(target, f.objects, f.data, f.result.checksum, f.options),
    /RESTORE_TARGET_CONTENT_MISMATCH/,
  );
  assert.equal(target.calls, calls);
  assert.equal(target.data.vessels[0].name, "Newer data, must not overwrite");
});

test("restore checks all track checksums before creating its session or writing", async () => {
  const f = await fixture(),
    target = new SerialRepository();
  f.source.data.track_archives = [
    { object_key: "tracks/missing.json.gz", checksum: "0".repeat(64) },
  ];
  const b = await backup(f.source, f.objects);
  await assert.rejects(
    restore(
      target,
      f.objects,
      await f.objects.get(b.key),
      b.checksum,
      f.options,
    ),
  );
  assert.equal(target.calls, 0);
  assert.equal(existsSync(f.options.sessionPath), false);
});

test("resumed restore preserves real PostgreSQL serial sequences and legacy event keys", async () => {
  const f = await fixture(),
    db = await PGlite.create({ extensions: { pg_trgm } });
  try {
    await db.exec(
      "CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA extensions;",
    );
    await db.exec(readFileSync("scripts/init-db-free-tier.sql", "utf8"));
    await db.exec(
      readFileSync("scripts/migrations/002-mediterranean-beta.sql", "utf8"),
    );
    let fail = true;
    class LocalPostgresRepository extends MemoryRepository {
      override async all<T>(table: Table): Promise<T[]> {
        // REST transports timestamps as JSON strings.
        return JSON.parse(
          JSON.stringify((await db.query(`SELECT * FROM "${table}"`)).rows),
        );
      }
      override async upsert(table: Table, rows: unknown[]) {
        const conflicts: Record<Table, string> = {
          vessels: "mmsi",
          anomaly_events: "event_key",
          sanctions: "id",
          track_archives: "mmsi,day",
          detected_stops: "id",
          import_states: "source",
        };
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i] as Record<string, unknown>,
            cols = Object.keys(row);
          const quoted = cols.map((c) => `"${c}"`);
          await db.query(
            `INSERT INTO "${table}"(${quoted.join(",")}) VALUES(${cols.map((_, j) => `$${j + 1}`).join(",")}) ON CONFLICT(${conflicts[table]}) DO UPDATE SET ${quoted.map((c) => `${c}=EXCLUDED.${c}`).join(",")}`,
            cols.map((c) =>
              typeof row[c] === "object" && row[c] !== null
                ? JSON.stringify(row[c])
                : row[c],
            ),
          );
          if (table === "sanctions" && fail && i === 1) {
            fail = false;
            throw new Error("RESPONSE_LOST_AFTER_COMMIT");
          }
        }
      }
    }
    const target = new LocalPostgresRepository();
    await assert.rejects(
      restore(target, f.objects, f.data, f.result.checksum, f.options),
      /RESPONSE_LOST_AFTER_COMMIT/,
    );
    await restore(target, f.objects, f.data, f.result.checksum, f.options);
    assert.equal((await target.all("sanctions")).length, 3);
    const inserted = await db.query<{ id: number }>(
      "INSERT INTO sanctions(name,source) VALUES('Future entry','EU') RETURNING id",
    );
    assert.equal(inserted.rows[0].id, 4);
    const event = (
      await target.all<{ event_key: string; id: number }>("anomaly_events")
    )[0];
    assert.match(event.event_key, /^[a-f0-9-]{36}$/);
    assert.equal(event.id, 1);
    const next = await db.query<{ id: number }>(
      "INSERT INTO anomaly_events(mmsi,type) VALUES('900000001','dark_activity') RETURNING id",
    );
    assert.equal(next.rows[0].id, 2);
  } finally {
    await db.close();
  }
});

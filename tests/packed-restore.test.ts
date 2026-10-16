import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { CompactRepository } from "../storage/compact-repository.js";
import { restore } from "../storage/backup.js";
import { encodeGroup, decodeGroup } from "../storage/metadata-groups.js";
import { FileObjectStore, checksum } from "../storage/object-store.js";
import type { Table } from "../storage/repository.js";

test("packed PostgreSQL restore resumes an ambiguous group commit without expanding history and preserves cold serial IDs", async () => {
  const db = await PGlite.create({ extensions: { pg_trgm } }),
    root = mkdtempSync(join(tmpdir(), "ais-packed-restore-")),
    objects = new FileObjectStore(join(root, "objects"));
  try {
    await db.exec(
      "CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;",
    );
    await db.exec(readFileSync("scripts/init-db.sql", "utf8"));
    await db.exec("SET ROLE service_role;");
    const event = {
        id: 900,
        event_key: "00000000-0000-4000-8000-000000000900",
        mmsi: "900000001",
        type: "dark_activity",
        detected_at: "2026-09-01T12:00:00.123456Z",
        details: { gap_hours: 9 },
      },
      hot = {
        ...event,
        id: 7,
        event_key: "00000000-0000-4000-8000-000000000007",
        detected_at: "2026-10-13T12:00:00Z",
      };
    const group = encodeGroup("anomaly_events", event.mmsi, "2026-09-01", [
      event,
    ]);
    const data = gzipSync(
        JSON.stringify({
          version: 2,
          created_at: "2026-10-13T13:00:00Z",
          snapshot: {
            vessels: [],
            anomaly_events: [hot],
            detected_stops: [],
            track_archives: [],
            sanctions: [],
            import_states: [],
          },
          metadata_groups: [group],
        }),
      ),
      sha = checksum(data),
      options = {
        target: "isolated-pglite",
        sessionPath: join(root, "session.json"),
      };
    let fail = true,
      writes = 0;
    class Target extends CompactRepository {
      override async restoreHotRows<T>(table: Table): Promise<T[]> {
        return (
          await db.query<any>(`SELECT to_jsonb(t) AS row FROM "${table}" t`)
        ).rows.map((r) => r.row);
      }
      override async upsert(table: Table, rows: unknown[]) {
        if (!rows.length) return;
        writes++;
        assert.equal(table, "anomaly_events");
        await db.query(
          "INSERT INTO anomaly_events SELECT * FROM jsonb_populate_recordset(NULL::anomaly_events,$1::jsonb) ON CONFLICT(event_key) DO NOTHING",
          [JSON.stringify(rows)],
        );
      }
    }
    const target = new Target("https://example.test", "test-only");
    Object.defineProperty(target, "client", {
      value: {
        from: () => {
          let kind = "";
          const q: any = {
            select: () => q,
            eq: (_: string, value: string) => {
              kind = value;
              return q;
            },
            order: () => q,
            limit: async () => ({
              data: (
                await db.query<any>(
                  "SELECT to_jsonb(t)-'payload' AS row FROM metadata_groups t WHERE kind=$1 ORDER BY mmsi,month",
                  [kind],
                )
              ).rows.map((r) => r.row),
              error: null,
            }),
          };
          return q;
        },
        rpc: async (name: string, args: any) => {
          if (name === "apply_metadata_groups_batch_beta") {
            const r = await db.query<any>(
              "SELECT apply_metadata_groups_batch_beta($1::jsonb) AS ok",
              [JSON.stringify(args.changes)],
            );
            if (fail) {
              fail = false;
              throw Error("AMBIGUOUS_COMMITTED_GROUP");
            }
            return { data: r.rows[0].ok, error: null };
          }
          if (name === "finish_restore_beta") {
            await db.query("SELECT finish_restore_beta()");
            return { data: null, error: null };
          }
          if (name === "advance_restored_anomalies_beta") {
            await db.query("SELECT advance_restored_anomalies_beta($1)", [
              args.minimum_id,
            ]);
            return { data: null, error: null };
          }
          throw Error("UNEXPECTED_RPC");
        },
      },
    });
    await assert.rejects(
      restore(target, objects, data, sha, options),
      /AMBIGUOUS/,
    );
    assert.equal(
      (await db.query("SELECT * FROM anomaly_events")).rows.length,
      1,
    );
    assert.equal(
      (await db.query("SELECT * FROM metadata_groups")).rows.length,
      1,
    );
    await db.query(
      "UPDATE metadata_groups SET first_at=first_at-interval '1 second'",
    );
    const before = writes;
    await assert.rejects(
      restore(target, objects, data, sha, options),
      /TARGET_CONTENT_MISMATCH/,
    );
    assert.equal(writes, before);
    await db.query("UPDATE metadata_groups SET first_at=$1", [group.first_at]);
    await restore(target, objects, data, sha, options);
    await assert.rejects(
      db.query("UPDATE metadata_groups SET payload=decode('00','hex')"),
    );
    await restore(target, objects, data, sha, options);
    assert.equal(
      (await db.query("SELECT * FROM anomaly_events")).rows.length,
      1,
    );
    const packed = (
      await db.query<any>(
        "SELECT encode(payload,'hex') AS payload_hex FROM metadata_groups",
      )
    ).rows[0];
    assert.deepEqual(
      decodeGroup({ ...group, payload: "\\x" + packed.payload_hex }),
      [event],
    );
    assert.equal(
      (
        await db.query<any>(
          "INSERT INTO anomaly_events(mmsi,type) VALUES ('900000001','dark_activity') RETURNING id",
        )
      ).rows[0].id,
      901,
    );
  } finally {
    await db.close();
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { encodeGroup, decodeGroup } from "../storage/metadata-groups.js";
const stop = {
  id: "900000001:2026-03-01T00:00:00Z",
  mmsi: "900000001",
  port_name: "38,15",
  port_lat: 38,
  port_lon: 15,
  arrived_at: "2026-03-01T00:00:00Z",
  departed_at: "2026-03-02T00:00:00Z",
  duration_hours: 24,
  last_seen_at: "2026-03-02T00:00:00Z",
  uncertain_departure: true,
};
test("compressed metadata preserves complete rows and refuses corrupt contents", () => {
  const g = encodeGroup("detected_stops", stop.mmsi, "2026-03-01", [stop]);
  assert.deepEqual(decodeGroup(g), [stop]);
  assert.throws(() => decodeGroup({ ...g, payload: "\\x0000" }), /CHECKSUM/);
  assert.throws(() => decodeGroup({ ...g, mmsi: "900000002" }), /INVALID/);
});
test("metadata transaction rejects stale rows/revisions, is repeatable, and preserves spatial lookup and permissions", async () => {
  const db = await PGlite.create({ extensions: { pg_trgm } });
  try {
    await db.exec(
      "CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;",
    );
    await db.exec(readFileSync("scripts/init-db.sql", "utf8"));
    const migration = readFileSync(
      "scripts/migrations/004-compact-metadata.sql",
      "utf8",
    );
    await db.exec(migration);
    await db.exec(migration);
    await db.query(
      "INSERT INTO detected_stops SELECT * FROM jsonb_populate_recordset(NULL::detected_stops,$1::jsonb)",
      [JSON.stringify([stop])],
    );
    const g = encodeGroup("detected_stops", stop.mmsi, "2026-03-01", [stop]);
    const { payload, ...meta } = g;
    const commit = async (prev: string | null, rows: unknown[]) =>
      db.query<{ ok: boolean }>(
        "SELECT apply_metadata_group_beta($1::jsonb,$2,$3::jsonb) AS ok",
        [
          JSON.stringify({ ...meta, payload_hex: payload.slice(2) }),
          prev,
          JSON.stringify(rows),
        ],
      );
    assert.equal(
      (await commit(null, [{ ...stop, duration_hours: 25 }])).rows[0].ok,
      false,
    );
    assert.equal(
      (await db.query("SELECT * FROM detected_stops")).rows.length,
      1,
    );
    assert.equal((await commit(null, [stop])).rows[0].ok, true);
    assert.equal(
      (await db.query("SELECT * FROM detected_stops")).rows.length,
      0,
    );
    assert.equal((await commit(null, [stop])).rows[0].ok, false);
    assert.equal((await commit(g.checksum, [])).rows[0].ok, true);
    assert.equal(
      (
        await db.query(
          "SELECT * FROM nearby_metadata_groups_beta(38,15,0.01,0.01)",
        )
      ).rows.length,
      1,
    );
    assert.equal(
      (
        await db.query(
          "SELECT * FROM nearby_metadata_groups_beta(48,25,0.01,0.01)",
        )
      ).rows.length,
      0,
    );
    const stored = (
      await db.query<any>(
        "SELECT *,encode(payload,'hex') AS payload_hex FROM metadata_groups",
      )
    ).rows[0];
    assert.deepEqual(
      decodeGroup({
        ...stored,
        month: new Date(stored.month).toISOString().slice(0, 10),
        payload: "\\x" + stored.payload_hex,
      }),
      [stop],
    );
    const at = "2026-03-06T12:00:00Z";
    const entry = {
      mmsi: "900000001",
      day: "2026-03-06",
      object_key: "tracks/test",
      checksum: "a".repeat(64),
      point_count: 1,
      compressed_bytes: 100,
      first_at: at,
      last_at: at,
      interval_seconds: 60,
      updated_at: at,
      last_position: {
        mmsi: "900000001",
        timestamp: at,
        lat: 38,
        lon: 15,
        speed: 0,
        course: 0,
        heading: null,
        nav_status: "at_anchor",
      },
    };
    await db.query(
      "INSERT INTO track_archives SELECT * FROM jsonb_populate_recordset(NULL::track_archives,$1::jsonb)",
      [JSON.stringify([entry])],
    );
    const archive = encodeGroup("track_archives", entry.mmsi, "2026-03-01", [
      entry,
    ]);
    const args = (packed: any, previous: string | null, rows: any[]) => ({
      g: { ...packed, payload_hex: packed.payload.slice(2) },
      previous_checksum: previous,
      expected_rows: rows,
    });
    await db.query(
      "SELECT apply_metadata_group_beta($1::jsonb,NULL,$2::jsonb)",
      [
        JSON.stringify({ ...archive, payload_hex: archive.payload.slice(2) }),
        JSON.stringify([entry]),
      ],
    );
    await db.query(
      "INSERT INTO track_archives SELECT * FROM jsonb_populate_recordset(NULL::track_archives,$1::jsonb)",
      [JSON.stringify([{ ...entry, compressed_bytes: 101 }])],
    );
    const metrics = (
      await db.query<any>("SELECT storage_metrics_compact_beta() AS value")
    ).rows[0].value;
    assert.equal(metrics.archive_objects, 1);
    assert.equal(metrics.archive_bytes, 101);
    const changed = encodeGroup("detected_stops", stop.mmsi, "2026-03-01", [
      { ...stop, duration_hours: 25 },
    ]);
    const failed = (
      await db.query<any>(
        "SELECT apply_metadata_groups_batch_beta($1::jsonb) AS ok",
        [
          JSON.stringify([
            args(changed, g.checksum, []),
            args(archive, "b".repeat(64), []),
          ]),
        ],
      )
    ).rows[0].ok;
    assert.equal(failed, false);
    assert.equal(
      (
        await db.query<any>(
          "SELECT checksum FROM metadata_groups WHERE kind='detected_stops'",
        )
      ).rows[0].checksum,
      g.checksum,
    );
    const anomaly = {
      id: 1234,
      event_key: "00000000-0000-4000-8000-000000001234",
      mmsi: stop.mmsi,
      type: "dark_activity",
      detected_at: "2026-03-04T12:00:00.123456Z",
      details: { gap_hours: 9 },
      lat: 38,
      lon: 15,
    };
    await db.query(
      "INSERT INTO anomaly_events SELECT * FROM jsonb_populate_recordset(NULL::anomaly_events,$1::jsonb)",
      [JSON.stringify([anomaly])],
    );
    const packedAnomaly = encodeGroup(
      "anomaly_events",
      stop.mmsi,
      "2026-03-01",
      [anomaly],
    );
    assert.deepEqual(decodeGroup(packedAnomaly), [anomaly]);
    const moveAnomaly = async (rows: unknown[]) =>
      (
        await db.query<any>(
          "SELECT apply_metadata_group_beta($1::jsonb,NULL,$2::jsonb) AS ok",
          [
            JSON.stringify({
              ...packedAnomaly,
              payload_hex: packedAnomaly.payload.slice(2),
            }),
            JSON.stringify(rows),
          ],
        )
      ).rows[0].ok;
    assert.equal(
      await moveAnomaly([{ ...anomaly, details: { gap_hours: 10 } }]),
      false,
    );
    assert.equal(
      (await db.query("SELECT * FROM anomaly_events")).rows.length,
      1,
    );
    assert.equal(await moveAnomaly([anomaly]), true);
    assert.equal(
      (await db.query("SELECT * FROM anomaly_events")).rows.length,
      0,
    );
    assert.equal(await moveAnomaly([anomaly]), false);
    await db.query(
      "INSERT INTO anomaly_events(id,mmsi,type) VALUES (500,$1,'dark_activity')",
      [stop.mmsi],
    );
    await db.query("SELECT finish_restore_beta()");
    assert.equal(
      (
        await db.query<any>(
          "INSERT INTO anomaly_events(mmsi,type) VALUES ($1,'dark_activity') RETURNING id",
          [stop.mmsi],
        )
      ).rows[0].id,
      501,
    );
    await db.exec("SET ROLE anon;");
    await assert.rejects(db.query("SELECT * FROM metadata_groups"));
    await assert.rejects(
      db.query("SELECT * FROM nearby_metadata_groups_beta(38,15,0.01,0.01)"),
    );
    await db.exec("RESET ROLE;");
  } finally {
    await db.close();
  }
});

test("partial-month retention preserves cutoff endpoints, recent endings and open stops", async () => {
  const { CompactRepository } =
    await import("../storage/compact-repository.js");
  const { rowMonth } = await import("../storage/metadata-groups.js");
  assert.equal(
    rowMonth("detected_stops", { arrived_at: "2026-08-01T00:30:00+02:00" }),
    "2026-07-01",
  );
  const at = "2026-07-15T00:00:00+00:00",
    entry = {
      mmsi: stop.mmsi,
      day: "2026-07-15",
      first_at: at,
      last_at: at,
      compressed_bytes: 10,
    };
  const old = {
    ...entry,
    day: "2026-07-10",
    first_at: "2026-07-10T00:00:00Z",
    last_at: "2026-07-10T01:00:00Z",
  };
  const ended = {
    ...stop,
    id: "long-ended",
    arrived_at: "2026-07-01T00:00:00Z",
    departed_at: "2026-10-01T00:00:00Z",
    last_seen_at: "2026-10-01T00:00:00Z",
  };
  const open = { ...stop, id: "long-open", departed_at: null };
  const groups = new Map<string, any>();
  for (const g of [
    encodeGroup("track_archives", stop.mmsi, "2026-07-01", [old, entry]),
    encodeGroup("detected_stops", stop.mmsi, "2026-07-01", [ended]),
    encodeGroup("detected_stops", stop.mmsi, "2026-03-01", [stop, open]),
  ])
    groups.set(g.kind + g.month, g);
  const repo = new CompactRepository("https://example.test", "test-only");
  Object.defineProperty(repo, "client", {
    value: {
      rpc: async (name: string, args: any) => {
        if (name === "prune_metadata_beta") return { data: null, error: null };
        const g = { ...args.g, payload: "\\x" + args.g.payload_hex },
          key = g.kind + g.month;
        assert.equal(groups.get(key).checksum, args.previous_checksum);
        if (g.row_count) groups.set(key, g);
        else groups.delete(key);
        return { data: true, error: null };
      },
    },
  });
  repo.groups = async function* (kind) {
    for (const g of [...groups.values()]) if (g.kind === kind) yield g;
  };
  await repo.prune("2026-07-15T00:00:00.000Z");
  assert.deepEqual(decodeGroup(groups.get("track_archives2026-07-01")), [
    entry,
  ]);
  assert.deepEqual(decodeGroup(groups.get("detected_stops2026-07-01")), [
    ended,
  ]);
  assert.deepEqual(decodeGroup(groups.get("detected_stops2026-03-01")), [open]);
});

test("anomaly reads merge recent and compressed events with stable public IDs and explicit corruption errors", async () => {
  const { CompactRepository } =
    await import("../storage/compact-repository.js");
  const { rowMonth } = await import("../storage/metadata-groups.js");
  const mmsi = stop.mmsi;
  const events = Array.from({ length: 110 }, (_, i) => ({
    id: i + 1,
    event_key: `event-${i}`,
    mmsi,
    type: "dark_activity",
    detected_at: new Date(Date.now() - (10 + i / 10) * 86400000).toISOString(),
    details: { gap_hours: 9, uncertainty: true },
  }));
  const groups = new Map<string, any>();
  for (const e of events) {
    const month = rowMonth("anomaly_events", e);
    const rows = groups.get(month) ?? [];
    rows.push(e);
    groups.set(month, rows);
  }
  const packed = [...groups].map(([month, rows]) =>
    encodeGroup("anomaly_events", mmsi, month, rows),
  );
  const recent = {
    ...events[0],
    detected_at: new Date().toISOString(),
    details: { gap_hours: 12 },
  };
  const repo = new CompactRepository("https://example.test", "test-only");
  const query: any = {
    select: () => query,
    eq: () => query,
    order: () => query,
    limit: async () => ({ data: [recent], error: null }),
  };
  Object.defineProperty(repo, "client", {
    value: { rpc: async () => ({ data: 0, error: null }), from: () => query },
  });
  repo.groups = async function* () {
    yield* packed;
  };
  const actual = await repo.anomalies(mmsi);
  assert.equal(actual.length, 100);
  assert.equal(actual[0].id, recent.event_key);
  assert.deepEqual(actual[0].details, recent.details);
  assert.equal(new Set(actual.map((e) => e.id)).size, 100);
  packed[0].payload = "\\x00";
  await assert.rejects(repo.anomalies(mmsi), /CHECKSUM/);
});

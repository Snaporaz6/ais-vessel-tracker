import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import {
  backup,
  decodeBackup,
  restore,
  retainedBackupReferences,
} from "../storage/backup.js";
import { CompactRepository } from "../storage/compact-repository.js";
import { MemoryRepository, type Snapshot } from "../storage/repository.js";
import { FileObjectStore, checksum } from "../storage/object-store.js";
import { encodeGroup } from "../storage/metadata-groups.js";

test("compact backup preserves monthly groups, expands hot overrides and protects cold objects", async () => {
  const objects = new FileObjectStore(
      mkdtempSync(join(tmpdir(), "ais-compact-backup-")),
    ),
    data = Buffer.from("verified track"),
    sha = checksum(data);
  await objects.put("tracks/cold", data);
  await objects.put("tracks/new", data);
  const at = "2026-08-31T23:59:59.123456Z";
  const entry = {
    mmsi: "900000001",
    day: "2026-08-31",
    object_key: "tracks/cold",
    checksum: sha,
    point_count: 1,
    compressed_bytes: data.length,
    first_at: at,
    last_at: at,
    interval_seconds: 60,
    updated_at: at,
    last_position: {
      mmsi: "900000001",
      timestamp: at,
      lat: 38,
      lon: 15,
      speed: 1,
      course: 90,
      heading: null,
      nav_status: "underway_engine" as const,
    },
  };
  const stop = {
    id: "old-stop",
    mmsi: entry.mmsi,
    port_name: "38,15",
    port_lat: 38,
    port_lon: 15,
    arrived_at: at,
    departed_at: "2026-09-01T01:00:00Z",
    duration_hours: 1,
    last_seen_at: "2026-09-01T01:00:00Z",
    uncertain_departure: true,
  };
  const anomaly = {
    id: 42,
    event_key: "00000000-0000-4000-8000-000000000042",
    mmsi: entry.mmsi,
    type: "dark_activity",
    detected_at: at,
    details: { gap_hours: 8, meaning: "observation gap" },
    lat: 38,
    lon: 15,
  };
  const groups = [
    encodeGroup("track_archives", entry.mmsi, "2026-08-01", [entry]),
    encodeGroup("detected_stops", entry.mmsi, "2026-08-01", [stop]),
    encodeGroup("anomaly_events", entry.mmsi, "2026-08-01", [anomaly]),
  ];
  const snapshot: Snapshot = {
    vessels: [],
    anomaly_events: [],
    detected_stops: [],
    track_archives: [{ ...entry, object_key: "tracks/new" }],
    sanctions: [],
    import_states: [],
  };
  const repo = Object.create(CompactRepository.prototype) as CompactRepository;
  repo.backupRepresentation = async () => ({
    snapshot,
    metadata_groups: groups,
  });
  const saved = await backup(repo, objects),
    bytes = await objects.get(saved.key),
    packed = decodeBackup(bytes, saved.checksum, false);
  assert.equal(packed.metadata_groups?.length, 3);
  assert.equal(packed.snapshot.detected_stops.length, 0);
  const expanded = decodeBackup(bytes, saved.checksum);
  assert.deepEqual(expanded.snapshot.detected_stops, [stop]);
  assert.deepEqual(expanded.snapshot.anomaly_events, [anomaly]);
  assert.equal(expanded.snapshot.track_archives.length, 1);
  assert.equal(expanded.snapshot.track_archives[0].object_key, "tracks/new");
  const refs = await retainedBackupReferences(objects);
  assert(refs.has("tracks/cold"));
  assert(refs.has("tracks/new"));
  const target = new MemoryRepository();
  await restore(target, objects, bytes, saved.checksum);
  assert.deepEqual(await target.stops(), [stop]);
  assert.deepEqual(await target.all("anomaly_events"), [anomaly]);
  packed.metadata_groups![0].payload = "\\x00";
  const broken = gzipSync(JSON.stringify(packed));
  assert.throws(
    () => decodeBackup(broken, checksum(broken)),
    /METADATA_CHECKSUM/,
  );
});

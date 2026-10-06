import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  appendFileSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { MemoryRepository } from "../storage/repository.js";
import { FileObjectStore } from "../storage/object-store.js";
import { DiskBudget, DurableOutbox } from "../storage/durable.js";
import { TrackStore } from "../storage/track-store.js";
import { LiveStore } from "../server/live-store.js";
import { Ingestor } from "../ingestor/index.js";
import type { VesselPosition } from "../shared/types.js";

const position = (mmsi: string, timestamp: string): VesselPosition => ({
  mmsi,
  timestamp,
  lat: 38,
  lon: 15,
  speed: 3,
  course: 10,
  heading: null,
  nav_status: "unknown",
});
test("restart reduces a multi-day spool to one latest observation per vessel without collecting full tracks", async () => {
  const root = mkdtempSync(join(tmpdir(), "ais-spool-summary-"));
  mkdirSync(join(root, "spool"));
  for (let day = 1; day <= 10; day++) {
    const at = `2026-10-${String(day).padStart(2, "0")}T12:00:00.000Z`;
    for (const mmsi of ["900000001", "900000002"])
      writeFileSync(
        join(root, "spool", `${mmsi}_${at.slice(0, 10)}.jsonl`),
        (JSON.stringify(position(mmsi, at)) + "\n").repeat(1000),
      );
  }
  const repo = new MemoryRepository(),
    budget = new DiskBudget(root);
  const tracks = new TrackStore(
    root,
    repo,
    new FileObjectStore(join(root, "objects")),
    budget,
  );
  tracks.pending = () => {
    throw new Error("global pending read is forbidden during recovery");
  };
  repo.archives = async () => {
    throw new Error("global catalog read is forbidden during recovery");
  };
  const live = new LiveStore();
  const ingestor = new Ingestor(
    root,
    live,
    tracks,
    new DurableOutbox(root, repo, budget),
    [30, -6, 46, 36.5],
  );
  await ingestor.warm();
  assert.equal(live.positions.size, 2);
  assert.equal(
    live.positions.get("900000001")?.timestamp,
    "2026-10-10T12:00:00.000Z",
  );
  assert.equal(tracks.pendingSummary().first_at, "2026-10-01T12:00:00.000Z");
  tracks.append(position("900000003", "2026-10-11T00:00:00.000Z"));
  assert.equal(tracks.pendingSummary().latest.size, 3);
});
test("oversized query windows fail explicitly without deleting spool and incomplete tails are quarantined", () => {
  const root = mkdtempSync(join(tmpdir(), "ais-spool-cap-")),
    dir = join(root, "spool");
  mkdirSync(dir);
  const at = "2026-10-06T00:00:00.000Z",
    path = join(dir, "900000001_2026-10-06.jsonl");
  writeFileSync(
    path,
    (JSON.stringify(position("900000001", at)) + "\n").repeat(100001),
  );
  appendFileSync(path, '{"mmsi":');
  const tracks = new TrackStore(
    root,
    new MemoryRepository(),
    new FileObjectStore(join(root, "objects")),
    new DiskBudget(root),
  );
  assert.equal(readFileSync(path + ".partial", "utf8"), '{"mmsi":');
  assert.throws(() => tracks.pending("900000001"), /TRACK_WINDOW_TOO_LARGE/);
  assert.equal(
    readFileSync(path, "utf8").split("\n").filter(Boolean).length,
    100001,
  );
  assert.equal(tracks.pendingSummary().latest.size, 1);
});

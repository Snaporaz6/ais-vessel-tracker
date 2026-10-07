import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryRepository } from "../storage/repository.js";
import { FileObjectStore } from "../storage/object-store.js";
import { TrackStore } from "../storage/track-store.js";
import { DiskBudget } from "../storage/durable.js";
import { backup } from "../storage/backup.js";
import type { VesselPosition } from "../shared/types.js";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "ais-archive-throughput-"));
  const repo = new MemoryRepository();
  const objects = new FileObjectStore(join(root, "objects"));
  const tracks = new TrackStore(root, repo, objects, new DiskBudget(root));
  return { repo, objects, tracks };
}
const position = (mmsi: string, at: number, gap = false): VesselPosition => ({
  mmsi,
  timestamp: new Date(at).toISOString(),
  lat: 38,
  lon: 15,
  speed: 10,
  course: 90,
  heading: null,
  nav_status: "underway_engine",
  gap_before: gap,
});

test(
  "bounded uploads drain on failure and preserve failed/new observations for a retry",
  { timeout: 5000 },
  async () => {
    const f = fixture(),
      now = Date.now();
    for (let i = 1; i <= 9; i++)
      f.tracks.append(position(String(900000000 + i), now - 120_000));
    let entered = 0,
      settled = false;
    let allEntered!: () => void, release!: () => void;
    const waiting = new Promise<void>((resolve) => {
      allEntered = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const put = f.objects.put.bind(f.objects);
    f.objects.put = async (key, data) => {
      entered++;
      if (entered === 8) allEntered();
      if (key.includes("/900000001/")) throw new Error("upload failed");
      await blocked;
      await put(key, data);
    };
    const flush = f.tracks.flush(now).then(
      () => {
        settled = true;
        return null;
      },
      (error: unknown) => {
        settled = true;
        return error;
      },
    );
    await waiting;
    assert.equal(entered, 8);
    assert.equal(settled, false);
    f.tracks.append(position("900000002", now - 60_000));
    release();
    assert((await flush) instanceof Error);
    assert.equal(entered, 8); // No next batch starts after an unverified upload.
    assert.equal((await f.repo.archives()).length, 7);
    assert.equal(f.tracks.pending().length, 3);
    f.objects.put = put;
    await f.tracks.flush(now);
    assert.equal((await f.repo.archives()).length, 9);
    assert.equal(f.tracks.pending().length, 0);
    const points = await f.tracks.read(
      "900000002",
      new Date(now - 180_000).toISOString(),
      new Date(now).toISOString(),
    );
    assert.deepEqual(
      points.map((p) => p.timestamp),
      [now - 120_000, now - 60_000].map((at) => new Date(at).toISOString()),
    );
  },
);

test("cold archives skip downloads but compact when the newer endpoint crosses a sampling tier", async () => {
  const f = fixture();
  const at = Date.UTC(2026, 9, 7, 12),
    first = Date.UTC(2026, 9, 5, 0, 30),
    evening = Date.UTC(2026, 9, 5, 23);
  f.tracks.append(position("900000001", first));
  for (let i = 0; i <= 30; i++)
    f.tracks.append(position("900000001", evening + i * 60_000, i === 0));
  await f.tracks.flush(at);
  const original = (await f.repo.archives())[0];
  assert.equal(original.interval_seconds, 300);
  const get = f.objects.get.bind(f.objects);
  let downloads = 0;
  f.objects.get = async (key) => {
    downloads++;
    return get(key);
  };
  await f.tracks.flush(at + 3600_000, true);
  assert.equal(downloads, 0);
  await f.tracks.flush(at + 86400_000, true);
  const compact = (await f.repo.archives())[0];
  assert(downloads > 0);
  assert.equal(compact.interval_seconds, 300);
  assert(compact.point_count < original.point_count);
  assert.equal(compact.first_at, original.first_at);
  assert.equal(compact.last_at, original.last_at);
  downloads = 0;
  await f.tracks.flush(at + 2 * 86400_000, true);
  assert.equal(downloads, 0);
  const points = await f.tracks.decode(compact);
  assert(points.some((p) => p.gap_before));
});

test("expired catalog entries need no track download and remain recoverable from retained backups", async () => {
  const f = fixture(),
    now = Date.now(),
    old = now - 91 * 86400_000;
  f.tracks.append(position("900000001", old));
  await f.tracks.flush(old);
  const entry = (await f.repo.archives())[0];
  await backup(f.repo, f.objects);
  const get = f.objects.get.bind(f.objects);
  f.objects.get = async (key) => {
    if (key === entry.object_key)
      throw new Error("expired track must not be downloaded");
    return get(key);
  };
  await f.tracks.flush(now, true);
  assert.equal((await f.repo.archives()).length, 0);
  assert((await get(entry.object_key)).length > 0);
});

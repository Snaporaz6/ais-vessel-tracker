import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { DiskReferenceIndex } from "../storage/reference-index.js";
import { FileObjectStore, checksum } from "../storage/object-store.js";
import { MemoryRepository, TABLES } from "../storage/repository.js";
import { ArchiveCleanup } from "../storage/archive-cleanup.js";

test("disk references match exact Set membership, duplicates and unusual keys", () => {
  const root = mkdtempSync(join(tmpdir(), "ais-index-"));
  const index = new DiskReferenceIndex(root),
    expected = new Set<string>();
  try {
    for (const key of [
      "tracks/quote'",
      "tracks/nave-è",
      ...Array.from({ length: 5000 }, (_, i) => `tracks/${i}`),
    ]) {
      expected.add(key);
      index.add(key);
      index.add(key);
    }
    assert.equal(index.size, expected.size);
    assert.deepEqual([...index], [...expected].sort());
    for (const key of expected) assert.equal(index.has(key), true);
    assert.equal(index.has("tracks/not-listed"), false);
    index.seal();
    assert.throws(() => index.add("tracks/after-seal"), /CLEANUP_INDEX_SEALED/);
  } finally {
    index.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("disk-index cleanup preserves catalog, backup and legacy objects", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "ais-index-cleanup-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const repo = new MemoryRepository(),
    objects = new FileObjectStore(join(root, "objects"));
  for (const key of [
    "tracks/catalog",
    "tracks/backup",
    "tracks/orphan",
    "legacy/march",
  ])
    await objects.put(key, Buffer.from(key));
  await repo.upsert("track_archives", [
    { mmsi: "636092919", day: "2026-10-14", object_key: "tracks/catalog" },
  ]);
  const value = {
    version: 1,
    snapshot: Object.fromEntries(
      TABLES.map((t) => [
        t,
        t === "track_archives" ? [{ object_key: "tracks/backup" }] : [],
      ]),
    ),
  };
  const data = gzipSync(JSON.stringify(value));
  await objects.put(`backups/verified-${checksum(data)}.json.gz`, data);
  const result = await new ArchiveCleanup(
    root,
    repo,
    objects,
    true,
    () => new DiskReferenceIndex(join(root, "refs")),
  ).run(Date.now() + 2 * 86400000);
  assert.equal(result.complete, true);
  assert.equal(result.deleted, 1);
  for (const key of ["tracks/catalog", "tracks/backup", "legacy/march"])
    assert.equal((await objects.get(key)).toString(), key);
  await assert.rejects(objects.get("tracks/orphan"));
});

test("index capacity failure prevents every object deletion", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "ais-index-full-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const repo = new MemoryRepository(),
    objects = new FileObjectStore(join(root, "objects"));
  await objects.put("tracks/orphan", Buffer.from("must survive"));
  const data = gzipSync(
    JSON.stringify({
      version: 1,
      snapshot: Object.fromEntries(
        TABLES.map((t) => [
          t,
          t === "track_archives"
            ? Array.from({ length: 5000 }, (_, i) => ({
                object_key: `tracks/${i}/${"x".repeat(160)}`,
              }))
            : [],
        ]),
      ),
    }),
  );
  await objects.put(`backups/verified-${checksum(data)}.json.gz`, data);
  await assert.rejects(
    new ArchiveCleanup(
      root,
      repo,
      objects,
      true,
      () => new DiskReferenceIndex(join(root, "refs"), 8192),
    ).run(Date.now() + 2 * 86400000),
    /CLEANUP_INDEX_UNAVAILABLE/,
  );
  assert.equal((await objects.get("tracks/orphan")).toString(), "must survive");
});

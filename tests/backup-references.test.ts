import test from "node:test";
import assert from "node:assert/strict";
import { gzipSync, createGzip } from "node:zlib";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { mkdtempSync, createWriteStream, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { TABLES } from "../storage/repository.js";
import { checksum } from "../storage/object-store.js";
import { encodeGroup } from "../storage/metadata-groups.js";
import { collectBackupReferences } from "../storage/backup-references.js";

function fixture() {
  return {
    version: 2,
    snapshot: Object.fromEntries(TABLES.map((t) => [t, [] as unknown[]])),
    metadata_groups: [] as ReturnType<typeof encodeGroup>[],
  };
}
test("streamed backup references retain hot and cold objects and reject invalid backups", async () => {
  const value = fixture();
  value.snapshot.track_archives.push({ object_key: "tracks/hot" });
  const group = encodeGroup("track_archives", "636092919", "2026-10-01", [
    {
      mmsi: "636092919",
      day: "2026-10-14",
      object_key: "tracks/cold",
      first_at: "2026-10-14T18:00:00Z",
      last_at: "2026-10-14T19:00:00Z",
      compressed_bytes: 50,
    },
  ]);
  value.metadata_groups.push(group);
  const read = async (input: unknown, sha?: string) => {
    const data = gzipSync(JSON.stringify(input)),
      refs = new Set<string>();
    await collectBackupReferences(data, sha ?? checksum(data), refs);
    return [...refs].sort();
  };
  assert.deepEqual(await read(value), ["tracks/cold", "tracks/hot"]);
  assert.deepEqual(await read({ version: 1, snapshot: value.snapshot }), [
    "tracks/hot",
  ]);
  await assert.rejects(read(value, "wrong"), /BACKUP_CHECKSUM_MISMATCH/);
  await assert.rejects(read({ ...value, version: 3 }), /BACKUP_INVALID/);
  await assert.rejects(
    read({ ...value, metadata_groups: {} }),
    /BACKUP_INVALID/,
  );
  await assert.rejects(
    read({ ...value, snapshot: { ...value.snapshot, vessels: {} } }),
    /BACKUP_INVALID/,
  );
  await assert.rejects(
    read({ ...value, metadata_groups: [group, group] }),
    /BACKUP_INVALID/,
  );
  await assert.rejects(
    read({ ...value, metadata_groups: [{ ...group, checksum: "bad" }] }),
    /METADATA_CHECKSUM_MISMATCH/,
  );
  const data = gzipSync(JSON.stringify(value));
  await assert.rejects(
    collectBackupReferences(data, checksum(data), new Set(), () => {
      throw new Error("CLEANUP_PENDING");
    }),
    /CLEANUP_PENDING/,
  );
});

test(
  "a snapshot larger than the heap is scanned without assembling its vessels",
  { timeout: 60_000 },
  async () => {
    const root = mkdtempSync(join(tmpdir(), "ais-stream-backup-")),
      path = join(root, "large.json.gz");
    try {
      const row = JSON.stringify({ mmsi: "636092919", name: "x".repeat(1024) });
      async function* document() {
        yield '{"version":1,"snapshot":{"vessels":[';
        for (let i = 0; i < 130_000; i++) yield (i ? "," : "") + row;
        yield "],";
        for (const t of TABLES.filter((t) => t !== "vessels"))
          yield JSON.stringify(t) +
            ":" +
            (t === "track_archives"
              ? '[{"object_key":"tracks/protected"}]'
              : "[]") +
            ",";
        yield '"extra":null}}';
      }
      await pipeline(
        Readable.from(document()),
        createGzip(),
        createWriteStream(path),
      );
      const code = `const {readFileSync}=require('node:fs');const {createHash}=require('node:crypto');const {collectBackupReferences}=require('./storage/backup-references.ts');(async()=>{const data=readFileSync(process.argv[1]),refs=new Set();await collectBackupReferences(data,createHash('sha256').update(data).digest('hex'),refs);console.log(JSON.stringify({refs:[...refs],rss:process.memoryUsage().rss}));})().catch(()=>process.exit(1));`;
      const child = spawnSync(
        process.execPath,
        ["--max-old-space-size=64", "--import", "tsx", "-e", code, path],
        {
          cwd: resolve("."),
          encoding: "utf8",
          timeout: 45_000,
        },
      );
      assert.equal(child.status, 0, child.stderr.slice(-1500));
      assert.deepEqual(JSON.parse(child.stdout).refs, ["tracks/protected"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);

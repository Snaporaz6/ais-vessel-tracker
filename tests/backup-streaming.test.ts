import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { CompactRepository } from "../storage/compact-repository.js";
import { backup, decodeBackup } from "../storage/backup.js";
import { FileObjectStore } from "../storage/object-store.js";

test("a changing metadata revision retries the streamed backup before publishing", async () => {
  const root = mkdtempSync(join(tmpdir(), "ais-backup-revision-"));
  try {
    const repo = Object.create(
      CompactRepository.prototype,
    ) as CompactRepository;
    let reads = 0,
      revision = 0;
    (repo as any).client = {
      rpc: async () => ({ data: [0, 1, 1, 1][revision++], error: null }),
    };
    repo.iterateHotRows = async function* <T>(table: string) {
      if (table === "vessels") reads++;
      if (table === "track_archives")
        yield { object_key: `tracks/attempt-${reads}` } as T;
    };
    repo.groups = async function* () {};
    const objects = new FileObjectStore(root),
      saved = await backup(repo, objects);
    assert.equal(reads, 2);
    const value = decodeBackup(
      await objects.get(saved.key),
      saved.checksum,
      false,
    );
    assert.equal(value.version, 2);
    assert.equal(
      value.snapshot.track_archives[0].object_key,
      "tracks/attempt-2",
    );
    const keys = [];
    for await (const item of objects.list("backups/")) keys.push(item.key);
    assert.deepEqual(keys, [saved.key]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test(
  "a paged snapshot larger than the heap is backed up and restored without a giant JSON allocation",
  { timeout: 60_000 },
  () => {
    const root = mkdtempSync(join(tmpdir(), "ais-backup-write-"));
    try {
      const code = `const {CompactRepository}=require('./storage/compact-repository.ts');const {backup}=require('./storage/backup.ts');const {FileObjectStore}=require('./storage/object-store.ts');(async()=>{const repo=Object.create(CompactRepository.prototype);repo.client={rpc:async()=>({data:0,error:null})};repo.iterateHotRows=async function*(table){if(table==='vessels')for(let i=0;i<130000;i++)yield {mmsi:String(900000000+i),name:'船'+ 'x'.repeat(1024)};};repo.groups=async function*(){};const saved=await backup(repo,new FileObjectStore(process.argv[1]));console.log(JSON.stringify(saved));})().catch(()=>process.exit(1));`;
      const child = spawnSync(
        process.execPath,
        ["--max-old-space-size=64", "--import", "tsx", "-e", code, root],
        {
          cwd: resolve("."),
          encoding: "utf8",
          timeout: 45_000,
        },
      );
      assert.equal(child.status, 0, child.stderr.slice(-1500));
      const saved = JSON.parse(child.stdout),
        value = decodeBackup(
          readFileSync(join(root, saved.key)),
          saved.checksum,
          false,
        );
      assert.equal(value.snapshot.vessels.length, 130_000);
      assert.equal(value.snapshot.vessels[0].mmsi, "900000000");
      assert.equal(value.snapshot.vessels.at(-1)?.mmsi, "900129999");
      assert.equal(
        value.snapshot.vessels.at(-1)?.name,
        "船" + "x".repeat(1024),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);

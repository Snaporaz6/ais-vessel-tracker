import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import {
  BucketStore,
  FileObjectStore,
  checksum,
} from "../storage/object-store.js";
import { ArchiveCleanup } from "../storage/archive-cleanup.js";
import { MemoryRepository, TABLES } from "../storage/repository.js";
import type { RuntimeConfig } from "../shared/runtime.js";

test("S3 HTTP 200 without exact per-key confirmations never confirms a batch", async (t) => {
  let mode = "full";
  const server = createServer((_req, res) => {
    res.setHeader("content-type", "application/xml");
    const deleted = (key: string) => `<Deleted><Key>${key}</Key></Deleted>`;
    res.end(
      `<DeleteResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">${
        mode === "full"
          ? deleted("a") + deleted("b")
          : mode === "partial"
            ? deleted("a") +
              "<Error><Key>b</Key><Code>AccessDenied</Code></Error>"
            : mode === "duplicate"
              ? deleted("a") + deleted("a")
              : mode === "unexpected"
                ? deleted("a") + deleted("other")
                : ""
      }</DeleteResult>`,
    );
  }).listen(0, "127.0.0.1");
  await once(server, "listening");
  const store = new BucketStore({
    S3_ENDPOINT: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
    S3_REGION: "us-east-1",
    S3_BUCKET: "test",
    S3_FORCE_PATH_STYLE: "true",
    S3_ACCESS_KEY_ID: "test",
    S3_SECRET_ACCESS_KEY: "test",
  } as RuntimeConfig);
  t.after(() => {
    store.client.destroy();
    server.closeAllConnections();
    server.close();
  });
  await store.deleteMany(["a", "b"]);
  for (mode of ["partial", "duplicate", "unexpected", "missing"])
    await assert.rejects(
      store.deleteMany(["a", "b"]),
      /ARCHIVE_DELETE_UNCONFIRMED/,
    );
  await assert.rejects(
    store.deleteMany(Array.from({ length: 1001 }, (_, i) => String(i))),
    /ARCHIVE_DELETE_INVALID_BATCH/,
  );
});

test(
  "parallel S3 groups drain before a partial failure permits a retry",
  { timeout: 15000 },
  async (t) => {
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const allEntered = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let active = 0,
      peak = 0,
      calls = 0,
      fail = true,
      settled = false;
    const sizes: number[] = [];
    const server = createServer((req, res) => {
      void (async () => {
        let body = "";
        for await (const chunk of req) body += chunk;
        const keys = [...body.matchAll(/<Key>(.*?)<\/Key>/g)].map(
          (match) => match[1],
        );
        sizes.push(keys.length);
        calls++;
        active++;
        peak = Math.max(peak, active);
        if (calls === 8) entered();
        if (!keys.includes("k0")) await gate;
        res.setHeader("content-type", "application/xml");
        res.end(
          `<DeleteResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">${keys.map((key) => (fail && key === "k0" ? `<Error><Key>${key}</Key><Code>AccessDenied</Code></Error>` : `<Deleted><Key>${key}</Key></Deleted>`)).join("")}</DeleteResult>`,
        );
        active--;
      })().catch(() => res.destroy());
    }).listen(0, "127.0.0.1");
    await once(server, "listening");
    const store = new BucketStore({
      S3_ENDPOINT: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
      S3_REGION: "us-east-1",
      S3_BUCKET: "test",
      S3_FORCE_PATH_STYLE: "true",
      S3_ACCESS_KEY_ID: "test",
      S3_SECRET_ACCESS_KEY: "test",
    } as RuntimeConfig);
    t.after(() => {
      release();
      store.client.destroy();
      server.closeAllConnections();
      server.close();
    });
    const keys = Array.from({ length: 1000 }, (_, i) => `k${i}`);
    const deleting = store.deleteMany(keys).then(
      () => {
        settled = true;
        return undefined;
      },
      (error) => {
        settled = true;
        return error as Error;
      },
    );
    await allEntered;
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(settled, false);
    assert.equal(calls, 8);
    assert(peak <= 8 && peak > 1);
    assert(sizes.every((size) => size > 0 && size <= 128));
    assert.equal(
      sizes.reduce((sum, size) => sum + size, 0),
      1000,
    );
    release();
    assert.match((await deleting)!.message, /ARCHIVE_DELETE_UNCONFIRMED/);
    assert.equal(active, 0);
    fail = false;
    await store.deleteMany(keys);
  },
);

test("a partly deleted batch retries from its checkpoint and preserves all protected objects", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "ais-bulk-cleanup-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const repo = new MemoryRepository();
  class BulkStore extends FileObjectStore {
    fail = true;
    batches: string[][] = [];
    async deleteMany(keys: string[]) {
      this.batches.push([...keys]);
      assert(keys.every((key) => key.startsWith("tracks/orphan-")));
      await super.delete(keys[0]);
      if (this.fail) throw Error("ARCHIVE_DELETE_UNCONFIRMED");
      for (const key of keys.slice(1)) await super.delete(key);
    }
  }
  const store = new BulkStore(join(root, "objects"));
  const orphans = Array.from({ length: 16 }, (_, i) => `tracks/orphan-${i}`);
  const protectedKeys = [
    "tracks/catalog",
    "tracks/backup",
    "tracks/recent",
    "legacy/march",
  ];
  for (const key of [...orphans, ...protectedKeys])
    await store.put(key, Buffer.from(key));
  await repo.upsert("track_archives", [
    { mmsi: "636092919", day: "2026-10-14", object_key: "tracks/catalog" },
  ]);
  const data = gzipSync(
    JSON.stringify({
      version: 1,
      snapshot: Object.fromEntries(
        TABLES.map((name) => [
          name,
          name === "track_archives" ? [{ object_key: "tracks/backup" }] : [],
        ]),
      ),
    }),
  );
  await store.put(`backups/verified-${checksum(data)}.json.gz`, data);
  const now = Date.now(),
    list = store.list.bind(store);
  store.list = async function* (prefix: string) {
    for await (const item of list(prefix))
      yield {
        ...item,
        modified: new Date(
          now -
            (item.key.startsWith("tracks/") && item.key !== "tracks/recent"
              ? 26 * 3600000
              : 0),
        ),
      };
  };
  await assert.rejects(
    new ArchiveCleanup(root, repo, store).run(now),
    /ARCHIVE_DELETE_UNCONFIRMED/,
  );
  const checkpoint = JSON.parse(
    readFileSync(join(root, "archive-cleanup-checkpoint.json"), "utf8"),
  );
  assert.equal(checkpoint.complete, false);
  assert(
    checkpoint.pending.some((item: { key: string }) => item.key === orphans[0]),
  );
  assert.equal(store.batches.length, 1);
  store.fail = false;
  const result = await new ArchiveCleanup(root, repo, store).run(now);
  assert.equal(result.complete, true);
  assert.equal(result.deleted, 16);
  assert.deepEqual(store.batches[0], store.batches[1]);
  for (const key of protectedKeys)
    assert.equal((await store.get(key)).toString(), key);
  for (const key of orphans) await assert.rejects(store.get(key));
});

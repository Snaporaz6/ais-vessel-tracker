import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { once } from "node:events";
import { runCleanupWorker } from "../server/cleanup-worker.js";
import type { RuntimeConfig } from "../shared/runtime.js";

test("an abrupt cleanup exit leaves the API alive and removes its scratch index", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "ais-worker-exit-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const script = join(root, "worker.cjs");
  writeFileSync(script, "process.exit(137)");
  const server = createServer((_req, res) => res.end("API alive")).listen(
    0,
    "127.0.0.1",
  );
  await once(server, "listening");
  t.after(() => server.close());
  const config = {
    ARCHIVE_CLEANUP_ENABLED: "true",
    storageDir: root,
  } as RuntimeConfig;
  await assert.rejects(
    runCleanupWorker(config, { workerPath: script, scratchRoot: root }),
    /CLEANUP_WORKER_EXITED/,
  );
  assert.equal(
    await (
      await fetch(
        `http://127.0.0.1:${(server.address() as { port: number }).port}`,
      )
    ).text(),
    "API alive",
  );
  assert.deepEqual(readdirSync(root), ["worker.cjs"]);
});

test("a stuck worker is terminated and cannot report maintenance complete", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "ais-worker-timeout-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const script = join(root, "worker.cjs");
  writeFileSync(script, "setInterval(()=>{},1000)");
  const config = {
    ARCHIVE_CLEANUP_ENABLED: "true",
    storageDir: root,
  } as RuntimeConfig;
  await assert.rejects(
    runCleanupWorker(config, {
      workerPath: script,
      scratchRoot: root,
      maxMs: 100,
      graceMs: 0,
    }),
    /CLEANUP_WORKER_TIMEOUT/,
  );
  assert.deepEqual(readdirSync(root), ["worker.cjs"]);
});

test("invalid worker results are rejected rather than marking cleanup complete", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "ais-worker-result-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const script = join(root, "worker.cjs");
  writeFileSync(
    script,
    "process.send({ok:true,result:{complete:true,deleted:'invalid'}},()=>process.exit(0))",
  );
  const config = {
    ARCHIVE_CLEANUP_ENABLED: "true",
    storageDir: root,
  } as RuntimeConfig;
  await assert.rejects(
    runCleanupWorker(config, { workerPath: script, scratchRoot: root }),
    /CLEANUP_WORKER_INVALID_RESULT/,
  );
});

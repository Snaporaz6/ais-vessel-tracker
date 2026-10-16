import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, unlinkSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { once } from "node:events";
import { createServer } from "node:http";
import { DiskBudget } from "../storage/durable.js";

test("disk scan leaves HTTP responsive while walking a large spool", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "ais-scan-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (let i = 0; i < 2000; i++) writeFileSync(join(root, String(i)), "data");
  const budget = new DiskBudget(root);
  const server = createServer((_req, res) => res.end("ok")).listen(
    0,
    "127.0.0.1",
  );
  await once(server, "listening");
  t.after(() => server.close());
  let done = false;
  const scan = budget.rescan();
  assert.equal(budget.rescan(), scan);
  void scan.then(() => {
    done = true;
  });
  const response = await fetch(
    `http://127.0.0.1:${(server.address() as { port: number }).port}`,
  );
  assert.equal(await response.text(), "ok");
  assert.equal(done, false, "HTTP must finish before the disk walk");
  await scan;
  assert.equal(budget.bytes, 8000);
});

test("concurrent spool deletion cannot cancel reservations for new writes", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "ais-quota-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const old = join(root, "archived");
  writeFileSync(old, Buffer.alloc(1_000_000));
  const budget = new DiskBudget(root, 1_020_000);
  const scan = budget.rescan();
  writeFileSync(join(root, "new"), Buffer.alloc(10_000));
  budget.bytes += 10_000;
  unlinkSync(old);
  budget.bytes -= 1_000_000;
  await scan;
  assert.ok(budget.bytes >= 10_000);
  await budget.rescan();
  assert.equal(budget.bytes, 10_000);
  assert.throws(() => budget.check(1_010_001), /PERSISTENT_VOLUME_FULL/);
});

test("failed scan preserves the last budget and permits retry", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "ais-scan-fail-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, "data"), "keep");
  const budget = new DiskBudget(root);
  rmSync(root, { recursive: true });
  await assert.rejects(budget.rescan());
  assert.equal(budget.bytes, 4);
  const { mkdirSync } = await import("node:fs");
  mkdirSync(root);
  writeFileSync(join(root, "data"), "restored");
  await budget.rescan();
  assert.equal(budget.bytes, 8);
});

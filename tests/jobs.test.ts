import test from "node:test";
import assert from "node:assert/strict";
import { BackgroundJobs } from "../server/jobs.js";
import { MemoryRepository } from "../storage/repository.js";
import { DurableOutbox, DiskBudget } from "../storage/durable.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unknownVessel } from "../server/live-store.js";

test("metadata delivery continues during a long archive and does not overlap itself", async () => {
  const jobs = new BackgroundJobs();
  let finishArchive!: () => void, finishDelivery!: () => void;
  let deliveries = 0,
    imports = 0;
  const archive = jobs.run(
    "archive",
    () =>
      new Promise<void>((r) => {
        finishArchive = r;
      }),
  );
  await jobs.run("sanctions", async () => {
    imports++;
  });
  const deliver = () => {
    deliveries++;
    return new Promise<void>((r) => {
      finishDelivery = r;
    });
  };
  const first = jobs.run("outbox", deliver),
    second = jobs.run("outbox", deliver);
  assert.equal(deliveries, 1);
  assert.equal(imports, 0);
  finishDelivery();
  await Promise.all([first, second]);
  await jobs.run("outbox", async () => {
    deliveries++;
  });
  assert.equal(deliveries, 2);
  assert.equal(imports, 0);
  finishArchive();
  await archive;
  assert.equal(imports, 1);
  jobs.close();
  await jobs.run("outbox", async () => {
    deliveries++;
  });
  assert.equal(deliveries, 2);
});

test("backup and shutdown callers wait for the metadata delivery already in progress", async () => {
  const root = mkdtempSync(join(tmpdir(), "ais-outbox-join-")),
    repo = new MemoryRepository();
  const outbox = new DurableOutbox(root, repo, new DiskBudget(root));
  let commit!: () => void;
  const upsert = repo.upsert.bind(repo);
  repo.upsert = async (table, rows) => {
    await new Promise<void>((r) => {
      commit = r;
    });
    await upsert(table, rows);
  };
  outbox.enqueue("vessels", unknownVessel("900000001"));
  const delivery = outbox.flush();
  let backupContinued = false;
  const backup = outbox.flush().then(() => {
    backupContinued = true;
  });
  await Promise.resolve();
  assert.equal(backupContinued, false);
  assert.equal(outbox.pending, 1);
  commit();
  await Promise.all([delivery, backup]);
  assert.equal(outbox.pending, 0);
  assert.equal((await repo.all("vessels")).length, 1);
});

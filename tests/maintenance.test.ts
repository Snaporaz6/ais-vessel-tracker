import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DailyMaintenance, type DailyJob } from "../server/maintenance.js";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "ais-maintenance-"));
  const queued: { name: string; action: () => Promise<unknown> }[] = [];
  let now = Date.parse("2026-10-05T04:00:00Z");
  return {
    root,
    queued,
    clock: () => now,
    set: (at: string) => {
      now = Date.parse(at);
    },
    dispatch: (name: string, action: () => Promise<unknown>) =>
      queued.push({ name, action }),
  };
}
test("restart after both UTC deadlines catches up once, then follows the next day's deadlines", async () => {
  const f = fixture(),
    completed: string[] = [];
  const jobs: DailyJob[] = [
    {
      name: "sanctions",
      hour: 3,
      minute: 0,
      action: async () => {
        completed.push("sanctions");
      },
    },
    {
      name: "backup",
      hour: 3,
      minute: 30,
      action: async () => {
        completed.push("backup");
      },
    },
  ];
  const daily = new DailyMaintenance(f.root, jobs, f.clock);
  daily.requestDue(f.dispatch);
  daily.requestDue(f.dispatch);
  assert.deepEqual(
    f.queued.map((j) => j.name),
    ["sanctions", "backup"],
  );
  while (f.queued.length) await f.queued.shift()!.action();
  assert.deepEqual(completed, ["sanctions", "backup"]);
  const restarted = new DailyMaintenance(f.root, jobs, f.clock);
  restarted.requestDue(f.dispatch);
  assert.equal(f.queued.length, 0);
  f.set("2026-10-06T02:59:59Z");
  restarted.requestDue(f.dispatch);
  assert.equal(f.queued.length, 0);
  f.set("2026-10-06T03:00:00Z");
  restarted.requestDue(f.dispatch);
  assert.deepEqual(
    f.queued.map((j) => j.name),
    ["sanctions"],
  );
  await f.queued.shift()!.action();
  f.set("2026-10-06T03:30:00Z");
  restarted.requestDue(f.dispatch);
  assert.deepEqual(
    f.queued.map((j) => j.name),
    ["backup"],
  );
});
test("failed import remains due and keeps its retry backoff across process restart", async () => {
  const f = fixture();
  let fail = true,
    imports = 0;
  const jobs: DailyJob[] = [
    {
      name: "sanctions",
      hour: 3,
      minute: 0,
      action: async () => {
        imports++;
        if (fail) throw new Error("SOURCE_UNAVAILABLE");
      },
    },
  ];
  const daily = new DailyMaintenance(f.root, jobs, f.clock);
  daily.requestDue(f.dispatch);
  await assert.rejects(f.queued.shift()!.action(), /SOURCE_UNAVAILABLE/);
  const restarted = new DailyMaintenance(f.root, jobs, f.clock);
  f.set("2026-10-05T04:04:59Z");
  restarted.requestDue(f.dispatch);
  assert.equal(f.queued.length, 0);
  assert.equal(
    JSON.parse(readFileSync(daily.path, "utf8")).completed_for.sanctions,
    undefined,
  );
  f.set("2026-10-05T04:05:00Z");
  fail = false;
  restarted.requestDue(f.dispatch);
  await f.queued.shift()!.action();
  assert.equal(imports, 2);
  assert.equal(
    JSON.parse(readFileSync(daily.path, "utf8")).completed_for.sanctions,
    "2026-10-05",
  );
});
test("successful backup followed by failed compaction does not count as a completed maintenance day", async () => {
  const f = fixture();
  let backups = 0,
    compactions = 0,
    fail = true;
  const jobs: DailyJob[] = [
    {
      name: "maintenance_backup",
      hour: 3,
      minute: 30,
      action: async () => {
        backups++;
        compactions++;
        if (fail) throw new Error("COMPACTION_UNAVAILABLE");
      },
    },
  ];
  const daily = new DailyMaintenance(f.root, jobs, f.clock);
  daily.requestDue(f.dispatch);
  await assert.rejects(f.queued.shift()!.action());
  f.set("2026-10-05T04:05:00Z");
  fail = false;
  const restarted = new DailyMaintenance(f.root, jobs, f.clock);
  restarted.requestDue(f.dispatch);
  await f.queued.shift()!.action();
  assert.equal(backups, 2);
  assert.equal(compactions, 2);
  assert.equal(
    JSON.parse(readFileSync(daily.path, "utf8")).completed_for
      .maintenance_backup,
    "2026-10-05",
  );
});
test("a queued job interrupted before execution remains recoverable after restart", async () => {
  const f = fixture();
  let executions = 0;
  const jobs: DailyJob[] = [
    {
      name: "backup",
      hour: 3,
      minute: 30,
      action: async () => {
        executions++;
      },
    },
  ];
  const daily = new DailyMaintenance(f.root, jobs, f.clock);
  daily.requestDue(f.dispatch);
  // The server's busy queue disappears with the old process, without a success marker.
  f.queued.length = 0;
  const restarted = new DailyMaintenance(f.root, jobs, f.clock);
  restarted.requestDue(f.dispatch);
  assert.equal(f.queued.length, 1);
  await f.queued.shift()!.action();
  assert.equal(executions, 1);
});

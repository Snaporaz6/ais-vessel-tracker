import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runDailyPhases } from "../server/daily-phases.js";
import { diagnosticCode } from "../shared/diagnostics.js";
import { ArchiveCleanup } from "../storage/archive-cleanup.js";
import { MemoryRepository } from "../storage/repository.js";
import { FileObjectStore } from "../storage/object-store.js";
import { readJSON } from "../storage/durable.js";

test("reordering cleanup preserves completed phases from an existing daily checkpoint", async () => {
  const root = mkdtempSync(join(tmpdir(), "ais-phase-order-")),
    now = Date.parse("2026-10-17T16:00:00Z");
  writeFileSync(
    join(root, "daily-phases.json"),
    JSON.stringify({
      day: "2026-10-17",
      completed: ["flush", "backup", "track_compaction", "metadata_compaction"],
    }),
  );
  const executed: string[] = [];
  await runDailyPhases(
    root,
    [
      "flush",
      "backup",
      "cleanup",
      "track_compaction",
      "metadata_compaction",
    ].map((name) => ({
      name,
      run: async () => {
        executed.push(name);
      },
    })),
    now,
  );
  assert.deepEqual(executed, ["cleanup"]);
});

test("paused cleanup never deletes objects or records completion, and resume keeps the verified backup", async () => {
  const root = mkdtempSync(join(tmpdir(), "ais-cleanup-pause-")),
    repo = new MemoryRepository(),
    objects = new FileObjectStore(join(root, "objects")),
    now = Date.now() + 2 * 86400000;
  await objects.put(
    "tracks/old-unreferenced",
    Buffer.from("keep while paused"),
  );
  let enabled = false,
    backups = 0;
  const phases = [
    {
      name: "backup",
      run: async () => {
        backups++;
      },
    },
    {
      name: "cleanup",
      run: () => new ArchiveCleanup(root, repo, objects, enabled).run(now),
    },
  ];
  await assert.rejects(runDailyPhases(root, phases, now), /CLEANUP_PAUSED/);
  assert.equal(diagnosticCode(new Error("CLEANUP_PAUSED")), "CLEANUP_PAUSED");
  assert.equal(
    (await objects.get("tracks/old-unreferenced")).toString(),
    "keep while paused",
  );
  assert.deepEqual(
    readJSON<{ completed: string[] }>(join(root, "daily-phases.json"), {
      completed: [],
    }).completed,
    ["backup"],
  );
  enabled = true;
  await runDailyPhases(root, phases, now);
  assert.equal(backups, 1);
  assert.deepEqual(
    readJSON<{ completed: string[] }>(join(root, "daily-phases.json"), {
      completed: [],
    }).completed,
    ["backup", "cleanup"],
  );
});
test("a cleanup retry and process restart preserve the verified daily backup phase", async () => {
  const root = mkdtempSync(join(tmpdir(), "ais-phases-")),
    now = Date.parse("2026-10-13T06:00:00Z");
  let backups = 0,
    cleanups = 0;
  const phases = [
    {
      name: "backup",
      run: async () => {
        backups++;
      },
    },
    {
      name: "cleanup",
      run: async () => {
        if (++cleanups === 1) throw new Error("CLEANUP_PENDING");
      },
    },
  ];
  await assert.rejects(runDailyPhases(root, phases, now));
  await runDailyPhases(root, phases, now);
  assert.equal(backups, 1);
  assert.equal(cleanups, 2);
  await runDailyPhases(root, phases, now);
  assert.equal(backups, 1);
  await runDailyPhases(root, phases, now + 86400000);
  assert.equal(backups, 2);
});
test("diagnostic classification never emits arbitrary messages or credential URLs", () => {
  assert.equal(
    diagnosticCode(new Error("https://secret:key@example.com?token=private")),
    "DEPENDENCY_FAILURE",
  );
  assert.equal(
    diagnosticCode(new Error("METADATA_CHECKSUM_MISMATCH")),
    "METADATA_CHECKSUM_MISMATCH",
  );
  assert.equal(
    diagnosticCode({ name: "TimeoutError", message: "private" }),
    "DEPENDENCY_TIMEOUT",
  );
});

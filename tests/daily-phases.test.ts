import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runDailyPhases } from "../server/daily-phases.js";
import { diagnosticCode } from "../shared/diagnostics.js";
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

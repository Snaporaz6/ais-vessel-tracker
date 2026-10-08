import test from "node:test";
import assert from "node:assert/strict";
import { summarize } from "../scripts/monitor-beta.js";
test("release gate requires seven observed days, affordable verified cost, database capacity and no gaps/restarts", () => {
  const start = Date.now() - 7 * 86400_000;
  const samples = Array.from({ length: 10081 }, (_, i) => ({
    at: new Date(start + i * 60_000).toISOString(),
    ready: true,
    maintenance_errors: {},
    sanctions_sources: [
      { source: "OFAC", status: "ok" },
      { source: "EU", status: "ok" },
    ],
    uptime_seconds: i * 60,
    database_bytes: 10_000_000 + i * 100,
    archive_bytes: i * 1000,
  }));
  assert.equal(summarize(samples, 24, start + 7 * 86400_000).passed, true);
  assert.equal(
    summarize(
      samples.map((s) => ({
        ...s,
        maintenance_errors: { maintenance_backup: start },
      })),
      24,
      start + 7 * 86400_000,
    ).passed,
    false,
  );
  assert.equal(
    summarize(
      samples.map((s) => ({
        ...s,
        sanctions_sources: [{ source: "EU", status: "stale" }],
      })),
      24,
      start + 7 * 86400_000,
    ).passed,
    false,
  );
  assert.equal(summarize(samples, null, start + 7 * 86400_000).passed, false);
  assert.equal(summarize(samples, 26, start + 7 * 86400_000).passed, false);
  assert.equal(
    summarize(samples.slice(-60), 24, start + 7 * 86400_000).passed,
    false,
  );
  samples[100].ready = false;
  assert.equal(summarize(samples, 24, start + 7 * 86400_000).passed, false);
  samples[100].ready = true;
  samples[100].uptime_seconds = 0;
  assert.equal(
    summarize(samples, 24, start + 7 * 86400_000).restarts_observed,
    1,
  );
});
test("duplicate measurements cannot hide days without observations", () => {
  const end = Date.now(),
    start = end - 7 * 86400_000,
    samples = Array.from({ length: 10080 }, (_, i) => ({
      at: new Date(start + Math.floor(i / 2) * 60_000).toISOString(),
      ready: true,
      maintenance_errors: {},
      sanctions_sources: [
        { source: "OFAC", status: "ok" },
        { source: "EU", status: "ok" },
      ],
      uptime_seconds: Math.floor(i / 2) * 60,
      database_bytes: 10_000_000,
      archive_bytes: 1_000_000,
    }));
  samples.push({
    ...samples[0],
    at: new Date(end).toISOString(),
    uptime_seconds: 7 * 86400,
  });
  const summary = summarize(samples.reverse(), 24, end);
  assert.equal(summary.passed, false);
  assert.equal(summary.missing_samples, 5040);
  assert.equal(summary.unique_observed_minutes, 5041);
  assert.equal(summary.duplicate_minute_samples, 5040);
});
test("seven days require recent valid timestamps rather than elapsed wall time alone", () => {
  const end = Date.now(),
    start = end - 7 * 86400_000,
    samples = Array.from({ length: 10081 }, (_, i) => ({
      at: new Date(start + i * 60_000).toISOString(),
      ready: true,
      maintenance_errors: {},
      sanctions_sources: [
        { source: "OFAC", status: "ok" },
        { source: "EU", status: "ok" },
      ],
      uptime_seconds: i * 60,
      database_bytes: 10_000_000,
      archive_bytes: 1_000_000,
    }));
  assert.equal(summarize(samples, 24, end + 3 * 60_000).passed, false);
  assert.equal(
    summarize(samples.slice(0, 60), 24, end).seven_days_observed,
    false,
  );
  assert.equal(summarize(samples, -1, end).passed, false);
  assert.equal(
    summarize(
      samples.map(({ archive_bytes, ...s }) => s),
      24,
      end,
    ).passed,
    false,
  );
  assert.equal(
    summarize(
      samples.map(({ uptime_seconds, ...s }) => s),
      24,
      end,
    ).passed,
    false,
  );
  assert.equal(summarize(samples.reverse(), 24, end).passed, true);
  samples.push({ ...samples[0], at: "invalid timestamp" });
  assert.equal(summarize(samples, 24, end).passed, false);
});

test("recovered maintenance retries remain visible and unresolved faults or missing metrics block release", () => {
  const end = Date.now(),
    start = end - 7 * 86400_000;
  const samples = Array.from({ length: 10081 }, (_, i) => ({
    at: new Date(start + i * 60_000).toISOString(),
    ready: true,
    uptime_seconds: i * 60,
    database_bytes: 10_000_000,
    archive_bytes: 1_000_000,
    archive_error: null as string | null,
    maintenance_errors: {} as Record<string, number>,
    sanctions_sources: [
      { source: "OFAC", status: "ok" },
      { source: "EU", status: "ok" },
    ],
  }));
  for (const sample of samples.slice(180, 240)) {
    sample.maintenance_errors.sanctions = start + 240 * 60_000;
    sample.sanctions_sources[1].status = "unavailable";
  }
  const recovered = summarize(samples, 24, end);
  assert.equal(recovered.operational_metrics_complete, true);
  assert.equal(recovered.maintenance_degraded_samples, 60);
  assert.equal(recovered.maintenance_currently_healthy, true);
  assert.equal(recovered.passed, true);
  samples.at(-1)!.maintenance_errors.maintenance_backup = end + 5 * 60_000;
  assert.equal(summarize(samples, 24, end).passed, false);
  samples.at(-1)!.maintenance_errors = {};
  samples.at(-1)!.archive_error = "ARCHIVE_UNAVAILABLE";
  assert.equal(summarize(samples, 24, end).passed, false);
  samples.at(-1)!.archive_error = null;
  samples.at(-1)!.sanctions_sources[1].status = "stale";
  assert.equal(summarize(samples, 24, end).passed, false);
  samples.at(-1)!.sanctions_sources[1].status = "ok";
  const missing = samples.map((s, i) =>
    i === 180 ? { ...s, maintenance_errors: undefined } : s,
  );
  assert.equal(summarize(missing, 24, end).passed, false);
});

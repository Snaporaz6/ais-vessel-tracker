import test from "node:test";
import assert from "node:assert/strict";
import { runLoadTest } from "../scripts/load-test.js";
test("remote load uses twenty concurrent clients without spoofed addresses and respects one-origin quota", async () => {
  let now = 0;
  const calls: { at: number; headers: Headers }[] = [];
  const report = await runLoadTest("https://example.invalid", true, {
    now: () => now,
    sleep: async (milliseconds) => {
      now += milliseconds;
    },
    fetch: async (_url, options) => {
      calls.push({ at: now, headers: new Headers(options?.headers) });
      await Promise.resolve();
      return new Response('{"vessels":[]}', { status: 200 });
    },
  });
  assert.equal(report.requests, 300);
  assert.equal(report.peak_concurrent_requests, 20);
  assert.equal(report.duration_seconds, 182);
  assert.equal(report.passed, true);
  assert.ok(calls.every((c) => !c.headers.has("X-Forwarded-For")));
  for (const call of calls)
    assert.ok(
      calls.filter((c) => c.at >= call.at && c.at < call.at + 60_000).length <=
        100,
    );
});
test("late responses cannot cause quota-breaking catch-up bursts", async () => {
  let now = 0,
    count = 0;
  const starts: number[] = [];
  await runLoadTest("https://example.invalid", true, {
    now: () => now,
    sleep: async (milliseconds) => {
      now += milliseconds;
    },
    fetch: async () => {
      if (count % 20 === 0) starts.push(now);
      if (count++ === 0) now += 60_000;
      return new Response('{"vessels":[]}', { status: 200 });
    },
  });
  for (let i = 1; i < starts.length; i++)
    assert.ok(starts[i] - starts[i - 1] >= 13_000);
  await assert.rejects(
    runLoadTest("https://example.invalid", false),
    /REQUIRES_LOOPBACK_SERVER/,
  );
});
test("rate-limit responses are reported separately and cannot count as fast valid samples", async () => {
  let now = 0,
    count = 0;
  const report = await runLoadTest("https://example.invalid", true, {
    now: () => now,
    sleep: async (milliseconds) => {
      now += milliseconds;
    },
    fetch: async () =>
      count++ < 20
        ? new Response('{"vessels":[]}', { status: 200 })
        : new Response("Too many requests", { status: 429 }),
  });
  assert.equal(report.requests, 300);
  assert.equal(report.successful_requests, 20);
  assert.equal(report.rate_limit_errors, 280);
  assert.equal(report.http_errors, 0);
  assert.equal(report.invalid_responses, 0);
  assert.equal(report.outcome, "rate_limited");
  assert.equal(report.complete_successful_sample, false);
  assert.equal(report.passed, false);
});
test("network and invalid successful responses are retained as failed attempts", async () => {
  let count = 0;
  const report = await runLoadTest("http://127.0.0.1", false, {
    fetch: async (_url, options) => {
      assert.ok(new Headers(options?.headers).has("X-Forwarded-For"));
      switch (count++ % 4) {
        case 0:
          throw new Error("Connection lost");
        case 1:
          return new Response("Unavailable", { status: 503 });
        case 2:
          return new Response("Invalid JSON", { status: 200 });
        default:
          return new Response('{"vessels":[]}', { status: 200 });
      }
    },
  });
  assert.equal(report.requests, 300);
  assert.equal(report.successful_requests, 75);
  assert.equal(report.network_errors, 75);
  assert.equal(report.http_errors, 75);
  assert.equal(report.invalid_responses, 75);
  assert.equal(report.outcome, "request_errors");
  assert.equal(report.passed, false);
});

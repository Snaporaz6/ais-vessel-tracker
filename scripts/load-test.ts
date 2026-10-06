import { createContext } from "../server/context.js";
import { createApp } from "../api/index.js";
import { once } from "node:events";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
const VISITORS = 20,
  REQUESTS_PER_VISITOR = 15,
  REMOTE_BURST_INTERVAL_MS = 13_000;
interface BenchmarkRuntime {
  fetch: typeof fetch;
  now: () => number;
  sleep: (milliseconds: number) => Promise<void>;
}
export async function runLoadTest(
  base: string,
  remote: boolean,
  overrides: Partial<BenchmarkRuntime> = {},
) {
  if (
    !remote &&
    !["127.0.0.1", "localhost", "[::1]"].includes(new URL(base).hostname)
  )
    throw new Error("LOCAL_BENCHMARK_REQUIRES_LOOPBACK_SERVER");
  const runtime: BenchmarkRuntime = {
      fetch,
      now: () => performance.now(),
      sleep: (milliseconds) =>
        new Promise((done) => setTimeout(done, milliseconds)),
      ...overrides,
    },
    times: number[] = [],
    started = runtime.now();
  let requests = 0,
    rateLimited = 0,
    httpErrors = 0,
    networkErrors = 0,
    invalidResponses = 0,
    active = 0,
    peak = 0;
  async function request(visitor: number) {
    requests++;
    active++;
    peak = Math.max(peak, active);
    const start = runtime.now(),
      headers: Record<string, string> = { "Accept-Encoding": "gzip" };
    // Only the loopback test server trusts these synthetic client addresses.
    if (!remote) headers["X-Forwarded-For"] = `198.51.100.${visitor + 1}`;
    try {
      const res = await runtime.fetch(
        base.replace(/\/$/, "") + "/api/map/live",
        {
          headers,
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (res.status === 429) {
        rateLimited++;
        return;
      }
      if (!res.ok) {
        httpErrors++;
        return;
      }
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        invalidResponses++;
        return;
      }
      if (
        !body ||
        typeof body !== "object" ||
        !Array.isArray((body as { vessels?: unknown }).vessels)
      ) {
        invalidResponses++;
        return;
      }
      times.push(runtime.now() - start);
    } catch {
      networkErrors++;
    } finally {
      active--;
    }
  }
  if (remote) {
    // Twenty simultaneous clients, 15 bursts over just over three minutes.
    // At most 100 requests in any sixty-second window from the real origin IP.
    let lastBurst = started;
    for (let burst = 0; burst < REQUESTS_PER_VISITOR; burst++) {
      const delay =
        burst === 0 ? 0 : lastBurst + REMOTE_BURST_INTERVAL_MS - runtime.now();
      if (delay > 0) await runtime.sleep(delay);
      lastBurst = runtime.now();
      await Promise.all(Array.from({ length: VISITORS }, (_, i) => request(i)));
    }
  } else {
    await Promise.all(
      Array.from({ length: VISITORS }, async (_, i) => {
        for (let n = 0; n < REQUESTS_PER_VISITOR; n++) await request(i);
      }),
    );
  }
  times.sort((a, b) => a - b);
  const p95 = times[Math.ceil(times.length * 0.95) - 1] ?? null,
    errors = rateLimited + httpErrors + networkErrors + invalidResponses,
    latencyPassed = p95 !== null && p95 < 1000,
    complete = times.length === VISITORS * REQUESTS_PER_VISITOR,
    passed = complete && errors === 0 && latencyPassed;
  return {
    at: new Date().toISOString(),
    environment: remote
      ? "configured-endpoint"
      : "local-synthetic-5000-vessels",
    visitor_model: remote
      ? "20-concurrent-clients-from-one-real-origin"
      : "20-synthetic-addresses-on-trusted-loopback-server",
    forwarded_ip_header: remote ? "omitted" : "synthetic-local-only",
    visitors: VISITORS,
    requests,
    successful_requests: times.length,
    errors,
    rate_limit_errors: rateLimited,
    http_errors: httpErrors,
    network_errors: networkErrors,
    invalid_responses: invalidResponses,
    peak_concurrent_requests: peak,
    burst_interval_ms: remote ? REMOTE_BURST_INTERVAL_MS : 0,
    p95_ms: p95,
    max_ms: times.at(-1) ?? null,
    latency_passed: latencyPassed,
    complete_successful_sample: complete,
    duration_seconds: (runtime.now() - started) / 1000,
    outcome: rateLimited
      ? "rate_limited"
      : errors
        ? "request_errors"
        : passed
          ? "passed"
          : "latency_exceeded",
    passed,
  };
}
async function main() {
  let server: ReturnType<ReturnType<typeof createApp>["listen"]> | undefined;
  let base = process.env.LOAD_TEST_URL;
  if (!base) {
    process.env.DEMO_MODE = "true";
    process.env.NODE_ENV = "test";
    process.env.ENV_FILE = "/nonexistent";
    process.env.STORAGE_DIR = mkdtempSync(join(tmpdir(), "ais-load-"));
    const c = await createContext();
    const now = new Date().toISOString();
    for (let i = 0; i < 5000; i++)
      c.live.latest({
        mmsi: String(900000000 + i),
        lat: 35 + (i % 100) / 10,
        lon: 4 + Math.floor(i / 100) / 10,
        speed: 10,
        course: 90,
        heading: null,
        nav_status: "underway_engine",
        timestamp: now,
      });
    server = createApp(c).listen(0, "127.0.0.1");
    await once(server, "listening");
    base = `http://127.0.0.1:${(server.address() as any).port}`;
  }
  let report: Awaited<ReturnType<typeof runLoadTest>>;
  try {
    report = await runLoadTest(base, !!process.env.LOAD_TEST_URL);
  } finally {
    server?.close();
  }
  if (process.env.REPORT_FILE)
    writeFileSync(process.env.REPORT_FILE, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  if (!report.passed) process.exitCode = 1;
}
if (require.main === module)
  void main().catch(() => {
    console.error("Prova di carico non riuscita.");
    process.exitCode = 1;
  });

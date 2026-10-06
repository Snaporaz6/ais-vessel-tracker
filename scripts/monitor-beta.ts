import { config } from "dotenv";
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
config({ path: process.env.ENV_FILE ?? ".env.local" });
interface Sample {
  at: string;
  ready: boolean;
  uptime_seconds?: number;
  cpu_seconds?: number;
  rss_bytes?: number;
  persistent_bytes?: number;
  database_bytes?: number;
  archive_bytes?: number;
  archive_error?: string | null;
  maintenance_errors?: Record<string, number>;
  sanctions_sources?: { source: string; status: string }[];
}
export function summarize(
  samples: Sample[],
  monthlyCost: number | null = null,
  now = Date.now(),
) {
  const ordered = samples
      .filter(
        (s) => Number.isFinite(Date.parse(s.at)) && Date.parse(s.at) <= now,
      )
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at)),
    invalid = samples.length - ordered.length,
    first = ordered[0],
    last = ordered.at(-1),
    firstAt = first ? Date.parse(first.at) : now,
    lastAt = last ? Date.parse(last.at) : now,
    elapsed = Math.max(0, lastAt - firstAt),
    minutes = new Set(
      ordered.map((s) => Math.floor(Date.parse(s.at) / 60_000)),
    ),
    expected = first
      ? Math.floor(now / 60_000) - Math.floor(firstAt / 60_000) + 1
      : 0,
    fresh = !!last && now - lastAt <= 2 * 60_000;
  const resets = ordered.filter(
    (s, i) =>
      i > 0 &&
      s.uptime_seconds !== undefined &&
      ordered[i - 1].uptime_seconds !== undefined &&
      s.uptime_seconds < ordered[i - 1].uptime_seconds!,
  ).length;
  const outage = ordered.filter((s) => !s.ready).length,
    missing = Math.max(0, expected - minutes.size),
    days = Math.max(elapsed / 86400_000, 1 / 1440);
  const rate = (field: "database_bytes" | "archive_bytes") =>
    first?.[field] !== undefined && last?.[field] !== undefined
      ? Math.max(0, last[field]! - first[field]!) / days
      : null;
  const dbDaily = rate("database_bytes"),
    archiveDaily = rate("archive_bytes");
  const measured = (value: unknown) =>
      typeof value === "number" && Number.isFinite(value) && value >= 0,
    metricsComplete =
      ordered.length > 0 &&
      ordered.every(
        (s) =>
          measured(s.uptime_seconds) &&
          measured(s.database_bytes) &&
          measured(s.archive_bytes) &&
          s.maintenance_errors !== undefined &&
          Object.keys(s.maintenance_errors).length === 0 &&
          ["OFAC", "EU"].every((source) =>
            s.sanctions_sources?.some(
              (s) => s.source === source && s.status === "ok",
            ),
          ) &&
          !s.archive_error,
      );
  const db90 =
    last?.database_bytes !== undefined && dbDaily !== null
      ? last.database_bytes + dbDaily * Math.max(0, 90 - days)
      : null;
  const archive90 =
    last?.archive_bytes !== undefined && archiveDaily !== null
      ? last.archive_bytes + archiveDaily * Math.max(0, 90 - days)
      : null;
  const complete =
      elapsed >= 7 * 86400_000 &&
      fresh &&
      invalid === 0 &&
      missing <= Math.ceil(expected * 0.01),
    withinBudget =
      monthlyCost !== null &&
      Number.isFinite(monthlyCost) &&
      monthlyCost >= 0 &&
      monthlyCost <= 25,
    dbFits = db90 !== null && db90 < 450 * 1024 * 1024;
  return {
    from: first?.at ?? null,
    to: last?.at ?? null,
    observed_days: days,
    samples: samples.length,
    unique_observed_minutes: minutes.size,
    duplicate_minute_samples: ordered.length - minutes.size,
    invalid_samples: invalid,
    latest_sample_fresh: fresh,
    operational_metrics_complete: metricsComplete,
    unavailable_samples: outage,
    missing_samples: missing,
    restarts_observed: resets,
    database_daily_growth_bytes: dbDaily,
    database_projected_90d_bytes: db90,
    archive_daily_growth_bytes: archiveDaily,
    archive_projected_90d_bytes: archive90,
    monthly_total_eur: monthlyCost,
    cost_gate_eur: 25,
    budget_max_eur: 30,
    seven_days_observed: complete,
    projected_database_within_free_limit: dbFits,
    cost_verified: withinBudget,
    passed:
      complete &&
      outage === 0 &&
      resets === 0 &&
      metricsComplete &&
      dbFits &&
      withinBudget,
  };
}
async function main() {
  const base = process.env.BETA_URL,
    token = process.env.ADMIN_TOKEN;
  if (!base || !token) throw new Error("BETA_URL_AND_ADMIN_TOKEN_REQUIRED");
  const file = resolve(process.env.BETA_LOG_FILE ?? "data/beta-monitor.jsonl"),
    report = /\.jsonl$/.test(file)
      ? file.replace(/\.jsonl$/, ".summary.json")
      : file + ".summary.json";
  mkdirSync(dirname(file), { recursive: true });
  let stop = false;
  const signal = new AbortController();
  const halt = () => {
    stop = true;
    signal.abort();
  };
  process.once("SIGINT", halt);
  process.once("SIGTERM", halt);
  while (!stop) {
    const sampledAt = Date.now(),
      at = new Date(sampledAt).toISOString();
    let sample: Sample = { at, ready: false };
    try {
      const [ready, metrics] = await Promise.all([
        fetch(base + "/ready", { signal: AbortSignal.timeout(20_000) }),
        fetch(base + "/admin/metrics", {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(20_000),
        }),
      ]);
      if (!metrics.ok) throw new Error("METRICS_UNAVAILABLE");
      sample = { ...(await metrics.json()), at, ready: ready.ok };
    } catch {
      /* failures are observations, never silently omitted */
    }
    appendFileSync(file, JSON.stringify(sample) + "\n", { flush: true });
    const all = readFileSync(file, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((s) => JSON.parse(s) as Sample),
      rawCost = process.env.VERIFIED_MONTHLY_TOTAL_EUR,
      summary = summarize(all, rawCost ? Number(rawCost) : null);
    writeFileSync(report, JSON.stringify(summary, null, 2), { flush: true });
    console.info(
      JSON.stringify({
        event: "beta_sample_saved",
        at,
        ready: sample.ready,
        samples: summary.samples,
        missing_samples: summary.missing_samples,
        unavailable_samples: summary.unavailable_samples,
        restarts_observed: summary.restarts_observed,
        database_bytes: sample.database_bytes,
        archive_bytes: sample.archive_bytes,
        rss_bytes: sample.rss_bytes,
      }),
    );
    if (!sample.ready)
      console.warn(JSON.stringify({ event: "beta_unavailable", at }));
    if (summary.passed)
      console.info(
        JSON.stringify({ event: "beta_release_gate_passed", report }),
      );
    if (process.argv.includes("--once") || summary.seven_days_observed) {
      console.log(JSON.stringify(summary));
      if (!summary.passed) process.exitCode = 1;
      break;
    }
    await new Promise<void>((r) => {
      const done = () => {
        clearTimeout(timer);
        signal.signal.removeEventListener("abort", done);
        r();
      };
      const timer = setTimeout(
        done,
        Math.max(0, sampledAt + 60_000 - Date.now()),
      );
      signal.signal.addEventListener("abort", done, { once: true });
      if (signal.signal.aborted) done();
    });
  }
}
if (require.main === module)
  void main().catch(() => {
    console.error(
      "Monitoraggio non avviato: verificare endpoint e configurazione locale.",
    );
    process.exitCode = 1;
  });

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { TABLES } from "../storage/repository.js";
import { LEGACY_TABLES, isRowCount } from "../storage/legacy-backup.js";

config({ path: process.env.ENV_FILE ?? ".env.local" });

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const manifestPath = process.env.VERIFIED_DATABASE_BACKUP;
  if (!url || !key || !anonKey || !manifestPath)
    throw new Error("DATABASE_VERIFICATION_SETTINGS_REQUIRED");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.verified !== true) throw new Error("VERIFIED_BACKUP_REQUIRED");
  const options = {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (u: RequestInfo | URL, i?: RequestInit) =>
        fetch(u, { ...i, signal: AbortSignal.timeout(20_000) }),
    },
  };
  const db = createClient(url, key, options);
  const anon = createClient(url, anonKey, options);
  const report: Record<string, any> = {
    at: new Date().toISOString(),
    tables: {},
  };
  let passed = true;
  for (const table of new Set([...LEGACY_TABLES, ...TABLES])) {
    const result = await db
      .from(table)
      .select("*", { count: "exact", head: true });
    const publicRead = await anon.from(table).select("*").limit(1);
    const before = manifest.tables[table]?.rows;
    const expectedRefresh =
      table === "sanctions" &&
      process.argv.includes("--allow-sanctions-refresh");
    const preserved =
      expectedRefresh || !isRowCount(before) || result.count === before;
    const valid =
      !result.error &&
      isRowCount(result.count) &&
      preserved &&
      !!publicRead.error;
    report.tables[table] = {
      rows: result.count,
      previous_rows: before,
      preserved,
      expected_refresh: expectedRefresh,
      public_read_denied: !!publicRead.error,
      passed: valid,
    };
    passed &&= valid;
  }
  const sample = await db
    .from("vessels")
    .select("mmsi,name")
    .order("mmsi")
    .limit(1);
  const mmsi = sample.data?.[0]?.mmsi;
  if (!mmsi || sample.error) throw new Error("DATABASE_SAMPLE_REQUIRED");
  const exact = await db.rpc("search_vessels_beta", { query_text: mmsi });
  const publicSearch = await anon.rpc("search_vessels_beta", {
    query_text: mmsi,
  });
  const publicLegacy = await anon.rpc("get_live_vessels", {
    min_lat: 30,
    min_lon: -6,
    max_lat: 46,
    max_lon: 36.5,
    since: new Date().toISOString(),
    max_results: 1,
  });
  const metrics = await db.rpc("storage_metrics_beta");
  const nearby = await db.rpc("nearby_stops_beta", {
    query_lat: 38,
    query_lon: 15,
    max_rows: 51,
  });
  const publicNearby = await anon.rpc("nearby_stops_beta", {
    query_lat: 38,
    query_lon: 15,
    max_rows: 51,
  });
  const searchValid =
    !exact.error && exact.data?.some((v: any) => v.mmsi === mmsi);
  const legacyDenied =
    !!publicLegacy.error && publicLegacy.error.code !== "PGRST202";
  report.rpc = {
    exact_search: !!searchValid,
    public_search_denied: !!publicSearch.error,
    public_legacy_denied: legacyDenied,
    metrics_available: !metrics.error,
    nearby_available: !nearby.error,
    public_nearby_denied:
      !!publicNearby.error && publicNearby.error.code !== "PGRST202",
  };
  report.storage = metrics.error ? null : metrics.data;
  passed &&=
    !nearby.error &&
    !!publicNearby.error &&
    publicNearby.error.code !== "PGRST202";
  passed &&=
    !!searchValid && !!publicSearch.error && legacyDenied && !metrics.error;
  report.passed = passed;
  if (process.env.REPORT_FILE)
    writeFileSync(process.env.REPORT_FILE, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  if (!passed) process.exitCode = 1;
}

void main().catch(() => {
  console.error(
    "Verifica post-migrazione non riuscita. Nessuna modifica al database.",
  );
  process.exitCode = 1;
});

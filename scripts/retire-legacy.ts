import { config } from "dotenv";
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { runtimeConfig } from "../shared/runtime.js";
import { BucketStore, checksum } from "../storage/object-store.js";
config({ path: process.env.ENV_FILE ?? ".env.local" });
async function main() {
  const path = process.env.LEGACY_VERIFIED_MANIFEST;
  if (!path || !process.argv.includes("--confirm-verified-archive"))
    throw new Error("LEGACY_PROOF_REQUIRED");
  const local = readFileSync(path),
    m = JSON.parse(local.toString());
  if (
    m.restore_verified !== true ||
    m.rows !== 596609 ||
    m.restored_rows !== m.rows ||
    !m.postgresql_rows_sha256 ||
    !m.parts?.length
  )
    throw new Error("LEGACY_PROOF_INVALID");
  const c = runtimeConfig({ requireAIS: false }),
    objects = new BucketStore(c),
    db = createClient(c.SUPABASE_URL!, c.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (u, i) =>
          fetch(u, { ...i, signal: AbortSignal.timeout(120000) }),
      },
    });
  const prefix = m.parts[0].key.replace(/\/positions-\d+\.jsonl.gz$/, "");
  if (!prefix.startsWith("legacy/march-2026/"))
    throw new Error("LEGACY_PREFIX_INVALID");
  const downloaded = await objects.get(prefix + "/manifest.json");
  if (checksum(downloaded) !== checksum(local))
    throw new Error("LEGACY_MANIFEST_MISMATCH");
  if (checksum(await objects.get(prefix + "/schema.sql")) !== m.schema_sha256)
    throw new Error("LEGACY_SCHEMA_MISMATCH");
  for (const p of m.parts) {
    if (
      !p.key.startsWith(prefix + "/") ||
      checksum(await objects.get(p.key)) !== p.checksum
    )
      throw new Error("LEGACY_ARCHIVE_CORRUPT");
  }
  const fp = await db.rpc("legacy_positions_fingerprint_beta");
  if (fp.error || fp.data !== m.postgresql_rows_sha256)
    throw new Error("LEGACY_SOURCE_CHANGED");
  const result = await db.rpc("retire_legacy_positions_beta", {
    expected_rows: m.rows,
    expected_first: m.source.first_at,
    expected_last: m.source.last_at,
    expected_fingerprint: m.postgresql_rows_sha256,
    verified_manifest_sha256: checksum(local),
  });
  if (result.error) throw new Error("LEGACY_RETIREMENT_FAILED");
  const count = await db
    .from("vessel_positions")
    .select("*", { count: "exact", head: true });
  if (count.error || count.count !== 0)
    throw new Error("LEGACY_RETIREMENT_UNVERIFIED");
  const report = {
    at: new Date().toISOString(),
    archive_prefix: prefix,
    manifest_sha256: checksum(local),
    ...result.data,
    remaining_rows: 0,
  };
  writeFileSync(
    path.replace(/manifest\.json$/, "retirement-report.json"),
    JSON.stringify(report, null, 2),
    { mode: 0o600 },
  );
  console.info(JSON.stringify(report));
}
void main().catch(() => {
  console.error(
    "LEGACY_RETIREMENT_NOT_VERIFIED: inspect the table count; archive copies are retained.",
  );
  process.exitCode = 1;
});

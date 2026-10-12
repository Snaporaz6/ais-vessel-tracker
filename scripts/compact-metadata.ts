import { config } from "dotenv";
import { CompactRepository } from "../storage/compact-repository.js";
import { runtimeConfig } from "../shared/runtime.js";
config({ path: process.env.ENV_FILE ?? ".env.local" });
async function main() {
  const c = runtimeConfig({ requireAIS: false });
  const simulated = process.argv
    .find((a) => a.startsWith("--reference-time="))
    ?.split("=")[1];
  if (
    simulated &&
    (c.NODE_ENV !== "test" || process.env.SNAPSHOT_TEST_ONLY !== "true")
  )
    throw new Error("SIMULATED_TIME_STAGING_ONLY");
  const now = simulated ? Date.parse(simulated) : Date.now();
  if (!Number.isFinite(now)) throw new Error("INVALID_REFERENCE_TIME");
  const r = new CompactRepository(
    c.SUPABASE_URL!,
    c.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const result = await r.compact(now);
  console.info(
    JSON.stringify({
      event: "metadata_compaction",
      ...result,
      metrics: await r.metrics(),
    }),
  );
  if (!result.complete) process.exitCode = 2;
}
void main().catch(() => {
  console.error(
    "METADATA_COMPACTION_FAILED: original or verified packed rows remain available.",
  );
  process.exitCode = 1;
});

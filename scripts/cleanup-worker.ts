import { config as dotenv } from "dotenv";
import { resolve } from "node:path";
import { runtimeConfig } from "../shared/runtime.js";
import { diagnosticCode } from "../shared/diagnostics.js";
import { PostgresRepository } from "../storage/repository.js";
import { CompactRepository } from "../storage/compact-repository.js";
import { BucketStore } from "../storage/object-store.js";
import { ArchiveCleanup } from "../storage/archive-cleanup.js";
import { DiskReferenceIndex } from "../storage/reference-index.js";

async function main() {
  if (!process.send || !process.env.CLEANUP_REFERENCE_DIR)
    throw new Error("CLEANUP_WORKER_REQUIRES_PARENT");
  process.once("disconnect", () => process.exit(1));
  dotenv({ path: process.env.ENV_FILE ?? resolve(".env.local") });
  const config = runtimeConfig({ requireAIS: false });
  if (config.demo) throw new Error("CLEANUP_WORKER_LIVE_ONLY");
  const maxMs = Number(process.env.CLEANUP_BUDGET_MS);
  if (!Number.isFinite(maxMs) || maxMs <= 0 || maxMs > 20 * 60_000)
    throw new Error("CLEANUP_WORKER_INVALID_BUDGET");
  const repo = new (
    config.METADATA_COMPACTION === "true"
      ? CompactRepository
      : PostgresRepository
  )(config.SUPABASE_URL!, config.SUPABASE_SERVICE_ROLE_KEY!);
  console.info(
    JSON.stringify({
      event: "cleanup_worker_started",
      heap_limit_mib: 128,
      rss_bytes: process.memoryUsage().rss,
    }),
  );
  const result = await new ArchiveCleanup(
    config.storageDir,
    repo,
    new BucketStore(config),
    config.ARCHIVE_CLEANUP_ENABLED !== "false",
    () => new DiskReferenceIndex(process.env.CLEANUP_REFERENCE_DIR!),
  ).run(Date.now(), maxMs);
  process.send({ ok: true, result }, () => process.exit(0));
}
if (require.main === module)
  void main().catch((error) => {
    const code = diagnosticCode(error);
    console.warn(JSON.stringify({ event: "cleanup_worker_failed", code }));
    if (process.send) process.send({ ok: false, code }, () => process.exit(1));
    else process.exitCode = 1;
  });

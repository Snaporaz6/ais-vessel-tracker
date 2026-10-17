/** Log classifications only. Never propagate provider messages, URLs or response bodies. */
export function diagnosticCode(error: unknown): string {
  const e = error as { name?: string; code?: string; message?: string };
  const codes = new Set([
    "DATABASE_UNAVAILABLE",
    "DATABASE_QUERY_TIMEOUT",
    "DATABASE_PERMISSION_DENIED",
    "DATABASE_SCHEMA_MISMATCH",
    "ARCHIVE_UNAVAILABLE",
    "ARCHIVE_CHECKSUM_MISMATCH",
    "ARCHIVE_INVALID",
    "ARCHIVE_DELETE_INVALID_BATCH",
    "ARCHIVE_DELETE_UNCONFIRMED",
    "PERSISTENT_VOLUME_FULL",
    "METADATA_CHECKSUM_MISMATCH",
    "METADATA_GROUP_INVALID",
    "METADATA_GROUP_DUPLICATES",
    "METADATA_GROUP_TOO_LARGE",
    "METADATA_CONCURRENT_RETRY",
    "METADATA_COMPACTION_PENDING",
    "CLEANUP_PENDING",
    "CLEANUP_PAUSED",
    "CLEANUP_INDEX_UNAVAILABLE",
    "CLEANUP_INDEX_SEALED",
    "CLEANUP_WORKER_EXITED",
    "CLEANUP_WORKER_TIMEOUT",
    "CLEANUP_WORKER_STOPPED",
    "CLEANUP_WORKER_UNAVAILABLE",
    "CLEANUP_WORKER_INVALID_RESULT",
    "CLEANUP_CHECKPOINT_INVALID",
    "BACKUP_UNVERIFIED",
    "BACKUP_CHECKSUM_MISMATCH",
    "IMPORT_FAILED",
    "SANCTIONS_DOWNLOAD_FAILED",
    "SANCTIONS_DOWNLOAD_INVALID",
    "INVALID_SANCTIONS_SOURCE",
    "INVALID_OFAC_XML",
    "INVALID_OFAC_SCHEMA",
    "INVALID_EU_SCHEMA",
    "INCOMPLETE_OFAC_IMPORT",
    "INCOMPLETE_EU_IMPORT",
    "EU_CONSOLIDATION_NOT_FOUND",
    "SANCTIONS_IMPORT_FAILED",
    "SANCTIONS_IMPORT_PARTIAL",
    "LEGACY_EXPORT_FAILED",
  ]);
  if (codes.has(e?.message ?? "")) return e.message!;
  if (/^SANCTIONS_HTTP_(?:202|[345]\d{2})$/.test(e?.message ?? ""))
    return e.message!;
  if (e?.name === "TimeoutError" || e?.name === "AbortError")
    return "DEPENDENCY_TIMEOUT";
  if (
    ["ECONNRESET", "ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT"].includes(
      e?.code ?? "",
    )
  )
    return "DEPENDENCY_NETWORK_ERROR";
  if (
    [
      "NoSuchKey",
      "NoSuchBucket",
      "AccessDenied",
      "SlowDown",
      "ServiceUnavailable",
    ].includes(e?.name ?? "")
  )
    return (
      "OBJECT_STORE_" +
      e.name!.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase()
    );
  return "DEPENDENCY_FAILURE";
}
export async function measuredPhase<T>(
  phase: string,
  action: () => Promise<T>,
): Promise<T> {
  const start = Date.now();
  try {
    const result = await action();
    console.info(
      JSON.stringify({
        event: "maintenance_phase_ok",
        phase,
        duration_ms: Date.now() - start,
      }),
    );
    return result;
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: "maintenance_phase_failed",
        phase,
        duration_ms: Date.now() - start,
        code: diagnosticCode(error),
      }),
    );
    throw error;
  }
}

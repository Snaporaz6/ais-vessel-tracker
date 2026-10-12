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
    "PERSISTENT_VOLUME_FULL",
    "METADATA_CHECKSUM_MISMATCH",
    "METADATA_GROUP_INVALID",
    "METADATA_GROUP_DUPLICATES",
    "METADATA_GROUP_TOO_LARGE",
    "METADATA_CONCURRENT_RETRY",
    "METADATA_COMPACTION_PENDING",
    "CLEANUP_PENDING",
    "CLEANUP_CHECKPOINT_INVALID",
    "BACKUP_UNVERIFIED",
    "BACKUP_CHECKSUM_MISMATCH",
    "IMPORT_FAILED",
    "LEGACY_EXPORT_FAILED",
  ]);
  if (codes.has(e?.message ?? "")) return e.message!;
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

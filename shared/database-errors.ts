/** Classify failures without retaining provider text, URLs or private responses. */
export function checkedDatabase<T>(result: { data: T; error: unknown }): T {
  if (!result.error) return result.data;
  const code = (result.error as { code?: string }).code;
  const name =
    code === "57014"
      ? "DATABASE_QUERY_TIMEOUT"
      : code === "42501"
        ? "DATABASE_PERMISSION_DENIED"
        : code === "42883" ||
            code === "42P01" ||
            code === "PGRST202" ||
            code === "PGRST205"
          ? "DATABASE_SCHEMA_MISMATCH"
          : "DATABASE_UNAVAILABLE";
  throw new Error(name);
}

/** Retry only safe reads. Mutation outcomes can be ambiguous and require reconciliation. */
export async function databaseFetch(
  url: RequestInfo | URL,
  init?: RequestInit,
) {
  const attempts = (init?.method ?? "GET").toUpperCase() === "GET" ? 3 : 1;
  for (let attempt = 0; ; attempt++) {
    try {
      const result = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(15_000),
      });
      if (attempt + 1 === attempts || ![502, 503, 504].includes(result.status))
        return result;
      await result.body?.cancel();
    } catch (error) {
      if (attempt + 1 === attempts) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100 * 4 ** attempt));
  }
}

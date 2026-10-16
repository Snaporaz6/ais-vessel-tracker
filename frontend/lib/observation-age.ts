export type ObservationAge = "recent" | "warning" | "old";

export function observationAge(timestamp: string, now: number): ObservationAge {
  const age = now - Date.parse(timestamp);
  if (!Number.isFinite(age)) return "recent";
  if (age > 60 * 60_000) return "old";
  if (age > 15 * 60_000) return "warning";
  return "recent";
}

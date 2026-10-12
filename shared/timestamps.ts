/** Normalize ISO offsets/zero padding without losing PostgreSQL microseconds. */
export function canonicalTimestamp(value: string): string {
  const match = value.match(
    /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/,
  );
  if (!match) return value;
  const base = new Date(match[1] + match[3]);
  if (!Number.isFinite(base.getTime())) return value;
  const fraction = (match[2] ?? "").replace(/0+$/, "").padEnd(3, "0");
  return base.toISOString().slice(0, 19) + "." + fraction + "Z";
}

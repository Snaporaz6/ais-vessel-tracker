import type { VesselPosition } from "../../shared/types";

/** Select only received fixes. A cursor inside a reception gap has no position. */
export function trackMoment(
  points: VesselPosition[],
  requestedAt: number | null,
) {
  if (!points.length) return null;
  const latest = points[points.length - 1];
  const firstAt = Date.parse(points[0].timestamp);
  const lastAt = Date.parse(latest.timestamp);
  const at =
    requestedAt === null
      ? lastAt
      : Math.max(firstAt, Math.min(lastAt, requestedAt));
  let low = 0,
    high = points.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (Date.parse(points[middle].timestamp) <= at) low = middle + 1;
    else high = middle;
  }
  const index = Math.max(0, low - 1);
  const previous = points[index],
    next = points[index + 1];
  const gap =
    next?.gap_before &&
    at > Date.parse(previous.timestamp) &&
    at < Date.parse(next.timestamp)
      ? { from: previous.timestamp, to: next.timestamp }
      : null;
  return {
    at,
    firstAt,
    lastAt,
    index,
    latest,
    position: gap ? null : previous,
    gap,
    live: at === lastAt,
  };
}

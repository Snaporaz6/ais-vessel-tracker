import { HISTORY_TIERS, TRACK_GAP_MS } from "./config";
import type { VesselPosition } from "./types";

/** Interval appropriate for a historical point's age. */
export function historyInterval(timestamp: string, now = Date.now()): number {
  const age = (now - Date.parse(timestamp)) / 86_400_000;
  return (HISTORY_TIERS.find((t) => age <= t.maxAgeDays) ?? HISTORY_TIERS[3])
    .intervalSeconds;
}

/** Normalized, ordered points; newer metadata wins at the same timestamp. */
export function mergePositions(
  ...groups: VesselPosition[][]
): VesselPosition[] {
  const unique = new Map<string, VesselPosition>();
  for (const group of groups)
    for (const pos of group) {
      const key = `${pos.mmsi}:${pos.timestamp}`;
      const prev = unique.get(key);
      unique.set(key, {
        ...prev,
        ...pos,
        significant: !!(prev?.significant || pos.significant),
        gap_before: !!(prev?.gap_before || pos.gap_before),
      });
    }
  return [...unique.values()].sort(
    (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp),
  );
}

/** Protect turns, state transitions, known gaps and anomaly observations. */
export function significantChange(
  prev: VesselPosition,
  next: VesselPosition,
): boolean {
  const delta =
    prev.course === null || next.course === null
      ? 0
      : Math.abs(((next.course - prev.course + 540) % 360) - 180);
  const stopped = (p: VesselPosition) => p.speed !== null && p.speed <= 1;
  return (
    delta > 25 ||
    prev.nav_status !== next.nav_status ||
    stopped(prev) !== stopped(next) ||
    !!next.significant ||
    !!next.gap_before ||
    !!next.anomaly_flags?.length
  );
}

/** Progressive archive compaction, preserving gap boundaries and endpoints. */
export function compactPositions(
  input: VesselPosition[],
  now = Date.now(),
): VesselPosition[] {
  const positions = mergePositions(input);
  if (positions.length < 3) return positions;
  const result = [positions[0]!];
  for (let i = 1; i < positions.length - 1; i++) {
    const p = positions[i]!;
    if (
      significantChange(positions[i - 1]!, p) ||
      positions[i + 1]!.gap_before ||
      Date.parse(p.timestamp) - Date.parse(result.at(-1)!.timestamp) >=
        historyInterval(p.timestamp, now) * 1000
    )
      result.push(p);
  }
  result.push(positions.at(-1)!);
  return result;
}

/** Display budget: never silently lose endpoints or known gap boundaries. */
export function downsampleTrack(
  positions: VesselPosition[],
  limit: number,
): VesselPosition[] {
  if (positions.length <= limit) return positions;
  const keep = new Set<number>([0, positions.length - 1]);
  for (let i = 1; i < positions.length; i++)
    if (positions[i]!.gap_before) {
      keep.add(i - 1);
      keep.add(i);
    }
  if (keep.size > limit) throw new Error("TOO_MANY_GAPS");
  const important: number[] = [];
  for (let i = 1; i < positions.length - 1; i++)
    if (!keep.has(i) && significantChange(positions[i - 1]!, positions[i]!))
      important.push(i);
  const sample = (indices: number[], budget: number) => {
    const count = Math.min(indices.length, budget);
    for (let j = 0; j < count; j++)
      keep.add(indices[Math.floor((j * indices.length) / count)]!);
  };
  sample(important, limit - keep.size);
  const remaining = positions.map((_, i) => i).filter((i) => !keep.has(i));
  sample(remaining, limit - keep.size);
  return [...keep].sort((a, b) => a - b).map((i) => positions[i]!);
}

/** Known gaps are explicit; cadence of coarse archives does not imply an outage. */
export function trackGaps(
  positions: VesselPosition[],
): { from: string; to: string }[] {
  return positions.flatMap((p, i) =>
    i > 0 && p.gap_before
      ? [{ from: positions[i - 1]!.timestamp, to: p.timestamp }]
      : [],
  );
}

/** Split a track rather than drawing a misleading line across missing observations. */
export function splitTrack(positions: VesselPosition[]): VesselPosition[][] {
  const segments: VesselPosition[][] = [];
  for (const p of positions) {
    if (!segments.length || p.gap_before) segments.push([]);
    segments.at(-1)!.push(p);
  }
  return segments;
}

/** Compare observation timestamps rather than sampled historical cadence. */
export function observationGap(
  prev: VesselPosition,
  next: VesselPosition,
): boolean {
  return Date.parse(next.timestamp) - Date.parse(prev.timestamp) > TRACK_GAP_MS;
}

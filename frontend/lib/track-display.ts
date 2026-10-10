import type { FeatureCollection } from "geojson";
import type { VesselPosition } from "../../shared/types";
import { splitTrack } from "../../shared/history";

export type TrackGap = { from: string; to: string };
export type TrackDisplayInfo = {
  mmsi: string;
  days: number;
  loading: boolean;
  error: string;
  count: number;
  firstAt: string | null;
  lastAt: string | null;
  gaps: TrackGap[];
};

/** Draw received observations, including isolated fixes, without filling gaps. */
export function trackGeometry(points: VesselPosition[]): FeatureCollection {
  const features: FeatureCollection["features"] = [];
  const markers = new Map<string, { point: VesselPosition; color: string }>();
  const mark = (point: VesselPosition, color: string) =>
    markers.set(point.timestamp, { point, color });
  for (const segment of splitTrack(points)) {
    if (segment.length === 1) mark(segment[0], "#60a5fa");
    else if (segment.length > 1)
      features.push({
        type: "Feature",
        properties: { kind: "observed" },
        geometry: {
          type: "LineString",
          coordinates: segment.map((p) => [p.lon, p.lat]),
        },
      });
  }
  for (let i = 1; i < points.length; i++) {
    const next = points[i];
    if (!next.gap_before) continue;
    const previous = points[i - 1];
    mark(previous, "#f59e0b");
    mark(next, "#f59e0b");
    // A separate, opt-in layer is a straight reference link, not an observed route.
    features.push({
      type: "Feature",
      properties: { kind: "gap" },
      geometry: {
        type: "LineString",
        coordinates: [
          [previous.lon, previous.lat],
          [next.lon, next.lat],
        ],
      },
    });
  }
  if (points.length) {
    mark(points[0], "#22c55e");
    mark(points.at(-1)!, "#f59e0b");
  }
  for (const { point, color } of markers.values())
    features.push({
      type: "Feature",
      properties: { color },
      geometry: { type: "Point", coordinates: [point.lon, point.lat] },
    });
  return { type: "FeatureCollection", features };
}

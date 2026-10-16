import { MercatorCoordinate, type Map as VesselMap } from "maplibre-gl";
import type { Position } from "geojson";

export type PlanePoint = { x: number; y: number };
type WaterPolygon = { rings: PlanePoint[][]; bounds: number[] };
type Segment = { a: PlanePoint; b: PlanePoint };
export type Shore = {
  heading: number;
  distance: number;
  point: PlanePoint;
  inward: PlanePoint;
};
function inRing(p: PlanePoint, ring: PlanePoint[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  }
  return inside;
}
function crosses(a: PlanePoint, b: PlanePoint, c: PlanePoint, d: PlanePoint) {
  const side = (p: PlanePoint, q: PlanePoint, r: PlanePoint) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
}

/** Loaded basemap geometry only; coast estimates never change received AIS data. */
export function vesselWaterMask(map: VesselMap) {
  const layers = (map.getStyle().layers ?? []).filter(
    (l) =>
      l.type === "fill" &&
      (("source-layer" in l && l["source-layer"] === "water") ||
        l.id === "water") &&
      !l.id.includes("shadow") &&
      l.layout?.visibility !== "none",
  );
  if (
    !layers.length ||
    layers.some((l) => "source" in l && !map.isSourceLoaded(l.source))
  )
    return null;
  const polygons: WaterPolygon[] = [],
    segments: Segment[] = [];
  for (const feature of map.queryRenderedFeatures({
    layers: layers.map((l) => l.id),
  })) {
    const g = feature.geometry;
    const list =
      g.type === "Polygon"
        ? [g.coordinates]
        : g.type === "MultiPolygon"
          ? g.coordinates
          : [];
    for (const coordinates of list) {
      const rings = coordinates.map((r) =>
        r.map((p: Position) => {
          const m = MercatorCoordinate.fromLngLat([p[0], p[1]]);
          return { x: m.x, y: m.y };
        }),
      );
      if (!rings[0]?.length) continue;
      const bounds = [Infinity, Infinity, -Infinity, -Infinity];
      for (const p of rings[0]) {
        bounds[0] = Math.min(bounds[0], p.x);
        bounds[1] = Math.min(bounds[1], p.y);
        bounds[2] = Math.max(bounds[2], p.x);
        bounds[3] = Math.max(bounds[3], p.y);
      }
      polygons.push({ rings, bounds });
      for (const ring of rings)
        for (let i = 1; i < ring.length; i++)
          segments.push({ a: ring[i - 1], b: ring[i] });
    }
  }
  if (!polygons.length) return null;
  const contains = (p: PlanePoint) =>
    polygons.some(
      ({ rings, bounds: b }) =>
        p.x >= b[0] &&
        p.y >= b[1] &&
        p.x <= b[2] &&
        p.y <= b[3] &&
        inRing(p, rings[0]) &&
        !rings.slice(1).some((r) => inRing(p, r)),
    );
  function shore(
    p: PlanePoint,
    units: number,
    maxMeters: number,
  ): Shore | null {
    let best: Shore | null = null,
      distance = maxMeters * units;
    for (const { a, b } of segments) {
      if (
        p.x < Math.min(a.x, b.x) - distance ||
        p.x > Math.max(a.x, b.x) + distance ||
        p.y < Math.min(a.y, b.y) - distance ||
        p.y > Math.max(a.y, b.y) + distance
      )
        continue;
      const dx = b.x - a.x,
        dy = b.y - a.y,
        size = Math.hypot(dx, dy);
      // Tiny coastal details do not provide a reliable quay axis.
      if (size < 8 * units) continue;
      const t = Math.max(
        0,
        Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (size * size)),
      );
      const point = { x: a.x + t * dx, y: a.y + t * dy };
      const d = Math.hypot(p.x - point.x, p.y - point.y);
      if (d >= distance) continue;
      const normal = { x: -dy / size, y: dx / size },
        step = 3 * units;
      const left = contains({
        x: point.x + normal.x * step,
        y: point.y + normal.y * step,
      });
      const right = contains({
        x: point.x - normal.x * step,
        y: point.y - normal.y * step,
      });
      // Reject vector-tile seams and boundaries covered by another water polygon.
      if (left === right) continue;
      best = {
        point,
        distance: d / units,
        heading: ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360,
        inward: {
          x: normal.x * (left ? 1 : -1),
          y: normal.y * (left ? 1 : -1),
        },
      };
      distance = d;
    }
    return best;
  }
  function fits(hull: PlanePoint[]) {
    if (!hull.every(contains)) return false;
    // Edge samples catch narrow piers; segment intersections catch slivers between samples.
    for (let i = 0; i < hull.length; i++) {
      const a = hull[i],
        b = hull[(i + 1) % hull.length];
      for (const t of [0.25, 0.5, 0.75])
        if (!contains({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }))
          return false;
      for (const s of segments) {
        if (
          Math.max(a.x, b.x) < Math.min(s.a.x, s.b.x) ||
          Math.min(a.x, b.x) > Math.max(s.a.x, s.b.x) ||
          Math.max(a.y, b.y) < Math.min(s.a.y, s.b.y) ||
          Math.min(a.y, b.y) > Math.max(s.a.y, s.b.y)
        )
          continue;
        if (crosses(a, b, s.a, s.b)) {
          const mid = { x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 };
          // A clipped tile boundary may be inside the union, not a coast.
          const len = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
          const eps = 1e-9;
          if (
            len &&
            contains({
              x: mid.x + ((s.b.y - s.a.y) / len) * eps,
              y: mid.y - ((s.b.x - s.a.x) / len) * eps,
            }) !==
              contains({
                x: mid.x - ((s.b.y - s.a.y) / len) * eps,
                y: mid.y + ((s.b.x - s.a.x) / len) * eps,
              })
          )
            return false;
        }
      }
    }
    // Also reject a tiny island wholly enclosed by the footprint.
    for (const { rings } of polygons)
      for (const ring of rings.slice(1))
        if (ring.some((p) => inRing(p, hull))) return false;
    return true;
  }
  return { contains, shore, fits };
}
export type VesselWaterMask = ReturnType<typeof vesselWaterMask>;

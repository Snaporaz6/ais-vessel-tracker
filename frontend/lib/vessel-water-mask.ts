import type { Map as VesselMap } from "maplibre-gl";
import type { Position } from "geojson";

type WaterPolygon = { rings: Position[][]; bounds: number[] };
function inRing(x: number, y: number, ring: Position[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (
      a[1] > y !== b[1] > y &&
      x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}

/** Reuse the already-loaded basemap water polygons; no extra network source. */
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
  const polygons: WaterPolygon[] = [];
  for (const feature of map.queryRenderedFeatures({
    layers: layers.map((l) => l.id),
  })) {
    const geometry = feature.geometry;
    const list =
      geometry.type === "Polygon"
        ? [geometry.coordinates]
        : geometry.type === "MultiPolygon"
          ? geometry.coordinates
          : [];
    for (const rings of list) {
      const bounds = [Infinity, Infinity, -Infinity, -Infinity];
      for (const p of rings[0] ?? []) {
        bounds[0] = Math.min(bounds[0], p[0]);
        bounds[1] = Math.min(bounds[1], p[1]);
        bounds[2] = Math.max(bounds[2], p[0]);
        bounds[3] = Math.max(bounds[3], p[1]);
      }
      polygons.push({ rings, bounds });
    }
  }
  return (lon: number, lat: number) =>
    polygons.some(
      ({ rings, bounds: b }) =>
        lon >= b[0] &&
        lon <= b[2] &&
        lat >= b[1] &&
        lat <= b[3] &&
        inRing(lon, lat, rings[0]) &&
        !rings.slice(1).some((r) => inRing(lon, lat, r)),
    );
}

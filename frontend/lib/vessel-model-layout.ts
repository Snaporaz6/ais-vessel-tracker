import { MercatorCoordinate } from "maplibre-gl";
import type { LiveMapVessel } from "../../shared/types";
import { LIVE_TTL_MS } from "../../shared/config";
import { MODEL_SPECS, type VesselModelProfile } from "./vessel-models";
import { vesselHeading, vesselModelPixels } from "./vessel-model-display";
import type { PlanePoint, Shore, VesselWaterMask } from "./vessel-water-mask";

export type ModelVessel = Pick<
  LiveMapVessel,
  | "mmsi"
  | "name"
  | "ship_type"
  | "lat"
  | "lon"
  | "heading"
  | "course"
  | "speed"
  | "timestamp"
  | "length"
  | "width"
> & { priority?: boolean };
export type ModelHover = ModelVessel & {
  displayLon: number;
  displayLat: number;
  estimated: boolean;
  displaced: boolean;
};
export type VesselPlacement = {
  vessel: ModelVessel;
  center: PlanePoint;
  heading: number | null;
  length: number;
  beam: number;
  model: boolean;
  estimated: boolean;
  displaced: boolean;
  stale: boolean;
  outline: PlanePoint[];
};
export type ModelExtent = {
  left: number;
  right: number;
  stern: number;
  bow: number;
};
const radians = Math.PI / 180;
const axisDifference = (a: number, b: number) =>
  Math.abs(((a - b + 270) % 180) - 90);
function outline(
  center: PlanePoint,
  angle: number,
  length: number,
  beam: number,
  extent: ModelExtent,
) {
  const c = Math.cos(angle * radians),
    s = Math.sin(angle * radians);
  return [
    [extent.left, extent.stern],
    [extent.right, extent.stern],
    [extent.right, extent.bow],
    [extent.left, extent.bow],
  ].map(([x, y]) => ({
    x: center.x + (x * beam * c + y * s) * length,
    y: center.y + (x * beam * s - y * c) * length,
  }));
}
/** Separating-axis check of full mesh bounds, including superstructures. */
function overlaps(a: PlanePoint[], b: PlanePoint[], gap: number) {
  for (const polygon of [a, b])
    for (let i = 0; i < 2; i++) {
      const p = polygon[i],
        q = polygon[i + 1],
        dx = q.x - p.x,
        dy = q.y - p.y;
      const size = Math.hypot(dx, dy),
        nx = -dy / size,
        ny = dx / size;
      let aMin = Infinity,
        aMax = -Infinity,
        bMin = Infinity,
        bMax = -Infinity;
      for (const point of a) {
        const value = point.x * nx + point.y * ny;
        aMin = Math.min(aMin, value);
        aMax = Math.max(aMax, value);
      }
      for (const point of b) {
        const value = point.x * nx + point.y * ny;
        bMin = Math.min(bMin, value);
        bMax = Math.max(bMax, value);
      }
      if (aMax + gap <= bMin || bMax + gap <= aMin) return false;
    }
  return true;
}
function estimatedHeading(
  v: ModelVessel,
  coast: Shore,
  neighbors: ModelVessel[],
  stale: boolean,
) {
  let parallel = 0,
    perpendicular = 0,
    reference: number | null = null,
    parallelReference: number | null = null;
  if (!stale && (v.length ?? MODEL_SPECS[v.ship_type].length) <= 60)
    for (const neighbor of neighbors) {
      if (
        neighbor.mmsi === v.mmsi ||
        neighbor.speed === null ||
        neighbor.speed >= 1
      )
        continue;
      const heading = vesselHeading(neighbor);
      if (heading === null) continue;
      const a = MercatorCoordinate.fromLngLat([v.lon, v.lat]),
        b = MercatorCoordinate.fromLngLat([neighbor.lon, neighbor.lat]);
      const distance =
        Math.hypot(a.x - b.x, a.y - b.y) / a.meterInMercatorCoordinateUnits();
      const normalDistance =
        Math.abs((b.x - a.x) * coast.inward.x + (b.y - a.y) * coast.inward.y) /
        a.meterInMercatorCoordinateUnits();
      if (distance > 60 || normalDistance > 12) continue;
      const diff = axisDifference(heading, coast.heading);
      if (diff < 20) {
        parallel++;
        parallelReference = heading;
      } else if (diff > 70) {
        perpendicular++;
        reference = heading;
      }
    }
  // A row needs at least two nearby boats with received headings as evidence.
  if (perpendicular >= 2 && perpendicular > parallel) {
    const h = (coast.heading + 90) % 180;
    return reference !== null &&
      Math.abs(((h - reference + 540) % 360) - 180) > 90
      ? (h + 180) % 360
      : h;
  }
  const h = coast.heading % 180;
  return parallelReference !== null &&
    Math.abs(((h - parallelReference + 540) % 360) - 180) > 90
    ? (h + 180) % 360
    : h;
}

/** Small visual offsets only: every placement retains its original AIS fix. */
export function layoutVesselModels(
  vessels: ModelVessel[],
  profiles: VesselModelProfile[],
  options: {
    zoom: number;
    mobile: boolean;
    now: number;
    water: VesselWaterMask;
    waterPending?: boolean;
    extents: Map<string, ModelExtent>;
    previous: Map<string, PlanePoint>;
  },
) {
  const { zoom, mobile, now, water, extents, previous } = options;
  const placed: VesselPlacement[] = [],
    occupied: PlanePoint[][] = [];
  const profileById = new Map(profiles.map((p) => [p.mmsi, p]));
  const fresh = vessels.filter(
    (v) => now - Date.parse(v.timestamp) <= LIVE_TTL_MS,
  );
  const ordered = vessels
    .slice()
    .sort(
      (a, b) =>
        Number(!!b.priority) - Number(!!a.priority) ||
        Number(now - Date.parse(a.timestamp) > LIVE_TTL_MS) -
          Number(now - Date.parse(b.timestamp) > LIVE_TTL_MS) ||
        a.mmsi.localeCompare(b.mmsi),
    );
  const limit = mobile ? 32 : 96;
  let modelCount = 0;
  for (const vessel of ordered) {
    const spec = MODEL_SPECS[vessel.ship_type] ?? MODEL_SPECS.other;
    const profile = profileById.get(vessel.mmsi),
      rawLength = profile?.length ?? vessel.length;
    const realLength =
      rawLength && rawLength > 0 && rawLength <= 500 ? rawLength : spec.length;
    const rawBeam = profile?.width ?? vessel.width;
    const beam =
      rawBeam && rawBeam > 0
        ? Math.min(0.6, Math.max(0.08, rawBeam / realLength))
        : spec.beam;
    const merc = MercatorCoordinate.fromLngLat([vessel.lon, vessel.lat]);
    const units = merc.meterInMercatorCoordinateUnits();
    const mpp =
      (40075016.686 * Math.cos(vessel.lat * radians)) / (512 * 2 ** zoom);
    const length = vesselModelPixels(realLength, mpp, mobile) * mpp;
    const stale =
      !Number.isFinite(Date.parse(vessel.timestamp)) ||
      now - Date.parse(vessel.timestamp) > LIVE_TTL_MS;
    const result: VesselPlacement = {
      vessel,
      center: { x: merc.x, y: merc.y },
      heading: vesselHeading(vessel),
      length,
      beam,
      model: false,
      estimated: false,
      displaced: false,
      stale,
      outline: [],
    };
    placed.push(result);
    // Keep old fixes distinct; selecting one explicitly may show its dated model.
    if (
      (stale && !vessel.priority) ||
      modelCount >= limit ||
      options.waterPending
    )
      continue;
    const coast =
      water?.shore(merc, units, Math.min(80, Math.max(25, realLength * 0.4))) ??
      null;
    if (
      result.heading === null &&
      vessel.speed !== null &&
      vessel.speed < 1 &&
      coast
    ) {
      result.heading = estimatedHeading(vessel, coast, fresh, stale);
      result.estimated = true;
    }
    if (result.heading === null) continue;
    const extent = extents.get(vessel.ship_type) ?? {
      left: -0.5,
      right: 0.5,
      stern: -0.5,
      bow: 0.5,
    };
    const maxShift = Math.min(60, (mobile ? 36 : 44) * mpp) * units;
    const c = Math.cos(result.heading * radians),
      s = Math.sin(result.heading * radians);
    const side = coast
      ? { x: coast.inward.x, y: coast.inward.y }
      : { x: c, y: s };
    const offsets: PlanePoint[] = [{ x: 0, y: 0 }];
    const old = previous.get(vessel.mmsi);
    if (old && Math.hypot(old.x, old.y) <= maxShift) offsets.push(old);
    // Side-by-side first; diagonal and longitudinal alternatives remain bounded.
    for (const step of [0.25, 0.5, 0.75, 1]) {
      const d = maxShift * step;
      for (const sign of [1, -1]) {
        offsets.push({ x: side.x * d * sign, y: side.y * d * sign });
        for (const diagonal of [-0.6, 0.6])
          offsets.push({
            x: (side.x * sign - side.y * diagonal) * d * 0.85,
            y: (side.y * sign + side.x * diagonal) * d * 0.85,
          });
      }
      offsets.push(
        { x: -side.y * d, y: side.x * d },
        { x: side.y * d, y: -side.x * d },
      );
    }
    for (const offset of offsets) {
      const center = { x: merc.x + offset.x, y: merc.y + offset.y };
      const shape = outline(
        center,
        result.heading,
        length * units,
        beam,
        extent,
      );
      if (occupied.some((other) => overlaps(shape, other, 2 * mpp * units)))
        continue;
      if (water && !water.fits(shape)) continue;
      result.center = center;
      result.outline = shape;
      result.model = true;
      result.displaced = Math.hypot(offset.x, offset.y) > 0.5 * mpp * units;
      previous.set(vessel.mmsi, offset);
      occupied.push(shape);
      modelCount++;
      break;
    }
  }
  const retained = new Set(vessels.map((v) => v.mmsi));
  for (const id of previous.keys()) if (!retained.has(id)) previous.delete(id);
  return placed;
}

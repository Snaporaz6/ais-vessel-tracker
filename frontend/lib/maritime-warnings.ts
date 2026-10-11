/** Public warning contract and conservative spatial assessment, shared with the map. */
export type WarningKind =
  "piracy" | "attack" | "incident" | "restriction" | "navigation";
export type WarningStatus =
  "active" | "historical" | "cancelled" | "expired" | "stale";
export type WarningEventStatus =
  "suspected" | "reported" | "confirmed" | "not_applicable";
export type WarningSourceStatus =
  "live" | "snapshot" | "stale" | "unavailable" | "discontinued";
export type WarningPosition = [number, number];
export type WarningBounds = [number, number, number, number];
export type WarningGeometry =
  | { type: "Point"; coordinates: WarningPosition }
  | { type: "Polygon"; coordinates: WarningPosition[][] };

export interface MaritimeWarningProperties {
  id: string;
  name: string;
  kind: WarningKind;
  source: string;
  sourceUrl: string;
  occurredAt: string | null;
  /** Report timestamp, kept separate when the event time is unknown. */
  reportedAt?: string | null;
  locationRole?: "incident_position" | "last_reported_vessel_position";
  validFrom: string | null;
  validUntil: string | null;
  updatedAt: string;
  status: WarningStatus;
  active: boolean;
  /** What the authority said at the last retrieval, independent of freshness now. */
  lastKnownInForce: boolean;
  eventStatus: WarningEventStatus;
  severity: "unspecified";
  officialSeverity: string | null;
  precision: "reported_position" | "reported_area" | "approximate_region";
  description: string;
  category: string;
  sourceStatus: WarningSourceStatus;
  /** Regional advisory markers are context; they are never incident coordinates. */
  regional: boolean;
}

export interface MaritimeWarningFeature {
  type: "Feature";
  id: string;
  geometry: WarningGeometry;
  properties: MaritimeWarningProperties;
}

export interface MaritimeWarningSource {
  source: string;
  sourceUrl: string;
  status: WarningSourceStatus;
  coverage: string;
  updatedAt: string | null;
  /** Source retrieval and last check are distinct from the source publication date. */
  fetchedAt?: string | null;
  checkedAt?: string | null;
  attribution?: string;
  licenseUrl?: string;
  complete: false;
  count: number;
  unmappedCount: number;
  message: string;
}

export interface UnmappedMaritimeReport {
  id: string;
  name: string;
  kind: WarningKind;
  source: string;
  sourceUrl: string;
  occurredAt: string | null;
  reportedAt: string;
  eventStatus: WarningEventStatus;
  description: string;
}

export interface MaritimeWarningCollection {
  type: "FeatureCollection";
  features: MaritimeWarningFeature[];
  metadata: {
    source: string;
    sourceUrl: string;
    coverage: string;
    updatedAt: string | null;
    fetchedAt?: string | null;
    checkedAt?: string | null;
    requestedAt: string;
    complete: false;
    status: "partial" | "unavailable";
    message: string;
    count: number;
    activeCount: number;
    unmappedCount: number;
    truncated: boolean;
    sources: MaritimeWarningSource[];
    /** These reports have no exact published coordinates; they are not geocoded. */
    unmappedReports?: UnmappedMaritimeReport[];
    disclaimer: string;
  };
}

// Required by NGA's nautical reproduction conditions; no agency seal is used.
export const NGA_DISCLAIMER =
  "This reproduction, partial or complete, of any National Geospatial-Intelligence Agency (NGA), National Imagery and Mapping Agency (NIMA) or Defense Mapping Agency (DMA) product, information or data is not approved, authorized or endorsed by the Secretary of Defense, the Director of National Intelligence, the Director, NGA or any other element of the US Government. The US Government and NGA accept no liability for the accuracy or quality of this reproduction or the use of any NGA, NIMA or DMA products, information or data.";

export const UKMTO_ATTRIBUTION =
  "Contains public sector information licensed under the Open Government Licence. Source: UK Maritime Trade Operations (UKMTO), © Crown copyright. This app is not endorsed by UKMTO.";

function longitudeNear(value: number, reference: number): number {
  return value + 360 * Math.round((reference - value) / 360);
}

function unwrappedRing(
  ring: readonly WarningPosition[],
  reference: number,
): WarningPosition[] {
  let previous = reference;
  return ring.map(([longitude, latitude]) => {
    previous = longitudeNear(longitude, previous);
    return [previous, latitude];
  });
}

function onSegment(
  point: WarningPosition,
  a: WarningPosition,
  b: WarningPosition,
): boolean {
  const cross =
    (b[0] - a[0]) * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0]);
  return (
    Math.abs(cross) < 1e-9 &&
    point[0] >= Math.min(a[0], b[0]) - 1e-9 &&
    point[0] <= Math.max(a[0], b[0]) + 1e-9 &&
    point[1] >= Math.min(a[1], b[1]) - 1e-9 &&
    point[1] <= Math.max(a[1], b[1]) + 1e-9
  );
}

function pointInRing(
  point: WarningPosition,
  ring: readonly WarningPosition[],
): boolean {
  let inside = false;
  for (
    let index = 0, previous = ring.length - 1;
    index < ring.length;
    previous = index++
  ) {
    const a = ring[index];
    const b = ring[previous];
    if (onSegment(point, a, b)) return true;
    if (
      a[1] > point[1] !== b[1] > point[1] &&
      point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}

function segmentsIntersect(
  a: WarningPosition,
  b: WarningPosition,
  c: WarningPosition,
  d: WarningPosition,
): boolean {
  const orientation = (
    p: WarningPosition,
    q: WarningPosition,
    r: WarningPosition,
  ) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  if (
    onSegment(a, c, d) ||
    onSegment(b, c, d) ||
    onSegment(c, a, b) ||
    onSegment(d, a, b)
  )
    return true;
  return (
    orientation(a, b, c) * orientation(a, b, d) < 0 &&
    orientation(c, d, a) * orientation(c, d, b) < 0
  );
}

/** Compare only explicit published areas, never invented point buffers or regional markers. */
export function observedTrackIntersectsAlert(
  coordinates: readonly WarningPosition[],
  feature: MaritimeWarningFeature,
): boolean {
  if (
    feature.geometry.type !== "Polygon" ||
    feature.properties.precision !== "reported_area"
  )
    return false;
  for (let index = 0; index < coordinates.length; index++) {
    const a = coordinates[index];
    const rings = feature.geometry.coordinates.map((ring) =>
      unwrappedRing(ring, a[0]),
    );
    if (rings.length === 0) continue;
    if (
      pointInRing(a, rings[0]) &&
      !rings.slice(1).some((ring) => pointInRing(a, ring))
    )
      return true;
    if (index + 1 >= coordinates.length) continue;
    const next = coordinates[index + 1];
    const b: WarningPosition = [longitudeNear(next[0], a[0]), next[1]];
    // Every line segment is supplied by the caller as observed, continuous track geometry.
    if (
      rings.some((ring) =>
        ring.some((c, edge) =>
          segmentsIntersect(a, b, c, ring[(edge + 1) % ring.length]),
        ),
      )
    )
      return true;
  }
  return false;
}

export interface ObservedTrackWarningAssessment {
  level: "active_alerts" | "insufficient_data";
  count: number;
  alertIds: string[];
  complete: false;
  basis: "intersection_with_current_published_areas";
}

/** Presence indicator, not a navigation risk rating, forecast, probability or safety clearance. */
export function assessObservedTrack(
  coordinates: readonly WarningPosition[],
  collection: MaritimeWarningCollection,
  now = Date.now(),
): ObservedTrackWarningAssessment {
  const ids = new Set<string>();
  for (const feature of collection.features) {
    const props = feature.properties;
    if (
      !props.active ||
      props.status !== "active" ||
      props.sourceStatus !== "live"
    )
      continue;
    if (props.validFrom && Date.parse(props.validFrom) > now) continue;
    if (props.validUntil && Date.parse(props.validUntil) < now) continue;
    // Do not let an old browser response continue presenting an alert as current indefinitely.
    if (now - Date.parse(props.updatedAt) > 30 * 60_000) continue;
    if (observedTrackIntersectsAlert(coordinates, feature)) ids.add(props.id);
  }
  return {
    level: ids.size ? "active_alerts" : "insufficient_data",
    count: ids.size,
    alertIds: [...ids],
    complete: false,
    basis: "intersection_with_current_published_areas",
  };
}

/** Bounding-box intersection including viewports and warning areas crossing the antimeridian. */
export function warningIntersectsBounds(
  feature: MaritimeWarningFeature,
  bounds: WarningBounds,
): boolean {
  const [west, south, rawEast, north] = bounds;
  const east = rawEast < west ? rawEast + 360 : rawEast;
  const reference = (west + east) / 2;
  if (feature.geometry.type === "Point") {
    const [rawLongitude, latitude] = feature.geometry.coordinates;
    const longitude = longitudeNear(rawLongitude, reference);
    return (
      longitude >= west &&
      longitude <= east &&
      latitude >= south &&
      latitude <= north
    );
  }
  const ring = unwrappedRing(feature.geometry.coordinates[0] ?? [], reference);
  if (!ring.length) return false;
  const longitudes = ring.map((point) => point[0]);
  const latitudes = ring.map((point) => point[1]);
  return (
    Math.min(...longitudes) <= east &&
    Math.max(...longitudes) >= west &&
    Math.min(...latitudes) <= north &&
    Math.max(...latitudes) >= south
  );
}

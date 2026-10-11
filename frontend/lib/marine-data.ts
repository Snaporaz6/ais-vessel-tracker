import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Feature, FeatureCollection, Geometry, Position } from "geojson";

export const MARINE_LAYERS = [
  "ports",
  "anchorages",
  "navigation",
  "cables",
  "pipelines",
  "offshore",
  "wrecks",
  "heritage",
  "protected",
  "territorial",
  "contiguous",
  "eez",
  "internal",
  "highseas",
  "shelf",
] as const;
export type MarineLayer = (typeof MARINE_LAYERS)[number];
export type MarineBbox = [number, number, number, number];
export interface MarineMetadata {
  source: string;
  sourceUrl: string;
  license: string;
  coverage: string;
  updatedAt: string | null;
  fetchedAt: string | null;
  complete: boolean;
  status: "ready" | "empty" | "zoom-required" | "partial" | "error";
  message: string;
  minZoom: number;
  truncated?: boolean;
  precision?: string;
}
export interface MarineCollection extends FeatureCollection<Geometry> {
  metadata: MarineMetadata;
}

const OSM_SOURCE = "https://www.openstreetmap.org/copyright";
const EMODNET_SOURCE = "https://emodnet.ec.europa.eu/en/human-activities";
const BOUNDARY_SOURCE = "https://www.marineregions.org/downloads.php";
const WFS = "https://ows.emodnet-humanactivities.eu/wfs";
const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
] as const;
const USER_AGENT =
  "AISVesselTracker/1.0 (https://github.com/Snaporaz6/ais-vessel-tracker)";
const MAX_FEATURES = 1500;
const MAX_BYTES = 5 * 1024 * 1024;
const TTL = 30 * 60 * 1000;
const MAX_CACHE_BYTES = 24 * 1024 * 1024;
const MAX_CACHE_ENTRIES = 36;
const BOUNDARIES = new Set<MarineLayer>([
  "territorial",
  "contiguous",
  "eez",
  "internal",
  "highseas",
  "shelf",
]);

const CATALOG: Record<
  MarineLayer,
  {
    minZoom: number;
    source: string;
    sourceUrl: string;
    license: string;
    coverage: string;
  }
> = {
  ports: {
    minZoom: 2,
    source: "NGA World Port Index",
    sourceUrl: "https://msi.nga.mil/Publications/WPI",
    license: "Public domain (US NGA)",
    coverage: "global selected ports; community harbour detail at zoom 9",
  },
  anchorages: {
    minZoom: 9,
    source: "OpenStreetMap / OpenSeaMap",
    sourceUrl: OSM_SOURCE,
    license: "ODbL 1.0",
    coverage: "global community mapping; incomplete",
  },
  navigation: {
    minZoom: 9,
    source: "OpenStreetMap / OpenSeaMap",
    sourceUrl: OSM_SOURCE,
    license: "ODbL 1.0",
    coverage: "global community mapping; incomplete",
  },
  cables: {
    minZoom: 6,
    source: "EMODnet / OpenStreetMap",
    sourceUrl: EMODNET_SOURCE,
    license: "CC BY 4.0 / ODbL 1.0",
    coverage: "European cables plus global community mapping; incomplete",
  },
  pipelines: {
    minZoom: 6,
    source: "EMODnet / OpenStreetMap",
    sourceUrl: EMODNET_SOURCE,
    license: "CC BY 4.0 / ODbL 1.0",
    coverage: "European pipelines plus global community mapping; incomplete",
  },
  offshore: {
    minZoom: 6,
    source: "EMODnet / OpenStreetMap",
    sourceUrl: EMODNET_SOURCE,
    license: "CC BY 4.0 / ODbL 1.0",
    coverage:
      "European installations plus global community mapping; incomplete",
  },
  wrecks: {
    minZoom: 7,
    source: "UK Hydrographic Office via EMODnet",
    sourceUrl:
      "https://emodnet.ec.europa.eu/geonetwork/srv/api/records/108ef240-fa6e-4b83-8569-09b509e2959d",
    license: "UK Open Government Licence v3 / EMODnet CC BY 4.0",
    coverage: "global selected charted and uncharted wrecks; incomplete",
  },
  heritage: {
    minZoom: 6,
    source: "EMODnet Heritage Ship Wrecks / OpenStreetMap",
    sourceUrl:
      "https://emodnet.ec.europa.eu/geonetwork/srv/api/records/e965088b-a265-4517-84df-c49b156af8a7",
    license: "CC BY 4.0 / ODbL 1.0",
    coverage:
      "Mediterranean archaeological wrecks, France, UK, Ireland and global community mapping; incomplete",
  },
  protected: {
    minZoom: 6,
    source: "EEA Natura 2000 via EMODnet / OpenStreetMap",
    sourceUrl:
      "https://emodnet.ec.europa.eu/geonetwork/srv/api/records/ac911c34-1692-4642-a031-87bcb5822158",
    license: "CC BY 4.0 / ODbL 1.0",
    coverage:
      "European marine/coastal Natura 2000 and globally mapped marine protected areas; incomplete",
  },
  territorial: {
    minZoom: 2,
    source: "Marine Regions / VLIZ",
    sourceUrl: BOUNDARY_SOURCE,
    license: "CC BY 4.0",
    coverage: "global, v4 (2023); no legal value",
  },
  contiguous: {
    minZoom: 2,
    source: "Marine Regions / VLIZ",
    sourceUrl: BOUNDARY_SOURCE,
    license: "CC BY 4.0",
    coverage: "global, v4 (2023); no legal value",
  },
  eez: {
    minZoom: 1,
    source: "Marine Regions / VLIZ",
    sourceUrl: BOUNDARY_SOURCE,
    license: "CC BY 4.0",
    coverage:
      "global, v12 (2023); dataset includes joint regimes and claims; no legal value",
  },
  internal: {
    minZoom: 3,
    source: "Marine Regions / VLIZ",
    sourceUrl: BOUNDARY_SOURCE,
    license: "CC BY 4.0",
    coverage: "global, v4 (2023); no legal value",
  },
  highseas: {
    minZoom: 1,
    source: "Marine Regions / VLIZ",
    sourceUrl: BOUNDARY_SOURCE,
    license: "CC BY 4.0",
    coverage: "global, v2 (2024); no legal value",
  },
  shelf: {
    minZoom: 1,
    source: "Marine Regions / VLIZ",
    sourceUrl: BOUNDARY_SOURCE,
    license: "CC BY 4.0",
    coverage:
      "global extended continental shelves, v2 (2024); seabed jurisdiction",
  },
};

export function isMarineLayer(value: string): value is MarineLayer {
  return (MARINE_LAYERS as readonly string[]).includes(value);
}

export function parseMarineBbox(value: string): MarineBbox | null {
  const parts = value.split(",");
  if (parts.length !== 4 || parts.some((part) => !part.trim())) return null;
  const coordinates = parts.map(Number);
  if (coordinates.some((n) => !Number.isFinite(n))) return null;
  const [west, south, east, north] = coordinates;
  if (
    west < -180 ||
    west > 180 ||
    east < -180 ||
    east > 180 ||
    south < -90 ||
    north > 90 ||
    south >= north ||
    west === east
  )
    return null;
  return coordinates as MarineBbox;
}

function boxes(bbox: MarineBbox): MarineBbox[] {
  const [w, s, e, n] = bbox;
  return w > e
    ? [
        [w, s, 180, n],
        [-180, s, e, n],
      ]
    : [bbox];
}

function metadata(
  layer: MarineLayer,
  overrides: Partial<MarineMetadata> = {},
): MarineMetadata {
  return {
    ...CATALOG[layer],
    updatedAt: null,
    fetchedAt: null,
    complete: false,
    status: "ready",
    message: "mapData.available",
    ...overrides,
  };
}

export function marineError(
  layer: MarineLayer,
  message = "mapData.unavailable",
): MarineCollection {
  return {
    type: "FeatureCollection",
    features: [],
    metadata: metadata(layer, { status: "error", message }),
  };
}

function area(bbox: MarineBbox) {
  const width = bbox[0] > bbox[2] ? 360 - bbox[0] + bbox[2] : bbox[2] - bbox[0];
  return width * (bbox[3] - bbox[1]);
}

// C0 controls are intentionally removed from provider text.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f]/g;
function text(value: unknown, limit = 400): string {
  return typeof value === "string"
    ? value.replace(CONTROL_CHARACTERS, " ").slice(0, limit)
    : "";
}

function coordsValid(value: unknown, depth = 0): boolean {
  if (!Array.isArray(value) || !value.length || depth > 5) return false;
  if (typeof value[0] === "number")
    return (
      value.length >= 2 &&
      Number.isFinite(value[0]) &&
      Number.isFinite(value[1]) &&
      Math.abs(value[0]) <= 180 &&
      Math.abs(value[1]) <= 90
    );
  return value.every((p) => coordsValid(p, depth + 1));
}

function cleanGeometry(value: unknown): Geometry | null {
  if (!value || typeof value !== "object") return null;
  const v = value as { type?: string; coordinates?: unknown };
  if (
    ![
      "Point",
      "MultiPoint",
      "LineString",
      "MultiLineString",
      "Polygon",
      "MultiPolygon",
    ].includes(v.type ?? "") ||
    !coordsValid(v.coordinates)
  )
    return null;
  return value as Geometry;
}

async function boundedJson(
  url: string,
  signal: AbortSignal,
  body?: string,
): Promise<any> {
  const response = await fetch(url, {
    method: body ? "POST" : "GET",
    body,
    redirect: "error",
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    signal,
    cache: "no-store",
  });
  if (
    !response.ok ||
    Number(response.headers.get("content-length")) > MAX_BYTES ||
    !response.body
  )
    throw new Error("Marine provider unavailable");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let length = 0,
    data = "";
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > MAX_BYTES)
        throw new Error("Marine provider result too large");
      data += decoder.decode(next.value, { stream: true });
    }
    data += decoder.decode();
  } catch (error) {
    await reader.cancel();
    throw error;
  }
  const value = JSON.parse(data);
  if (value.error || value.remark || value.exception)
    throw new Error("Marine provider error");
  return value;
}

const snapshots = new Map<
  MarineLayer | "eez-detail",
  Promise<MarineCollection>
>();
async function snapshot(
  layer: MarineLayer | "eez-detail",
): Promise<MarineCollection> {
  let pending = snapshots.get(layer);
  if (!pending) {
    pending = readFile(
      join(process.cwd(), "public", "marine-data", `${layer}.json`),
      "utf8",
    ).then((body) => {
      const value = JSON.parse(body) as MarineCollection;
      if (
        value.type !== "FeatureCollection" ||
        !Array.isArray(value.features) ||
        !value.features.length ||
        !value.metadata
      )
        throw new Error("Missing marine snapshot");
      return value;
    });
    snapshots.set(layer, pending);
    pending.catch(() => snapshots.delete(layer));
  }
  return pending;
}

function geometryIntersects(geometry: Geometry, bbox: MarineBbox): boolean {
  if (geometry.type === "GeometryCollection")
    return geometry.geometries.some((g) => geometryIntersects(g, bbox));
  let west = Infinity,
    east = -Infinity,
    south = Infinity,
    north = -Infinity;
  function visit(value: Position | Position[] | Position[][] | Position[][][]) {
    if (typeof value[0] === "number") {
      const p = value as Position;
      west = Math.min(west, p[0]);
      east = Math.max(east, p[0]);
      south = Math.min(south, p[1]);
      north = Math.max(north, p[1]);
    } else for (const p of value) visit(p as Position);
  }
  visit(geometry.coordinates);
  return boxes(bbox).some(
    ([w, s, e, n]) => west <= e && east >= w && south <= n && north >= s,
  );
}

function osmSelectors(layer: MarineLayer): string[] {
  switch (layer) {
    case "ports":
      return [
        '["seamark:type"~"^(harbour|berth|mooring|dock)$"]',
        '["harbour"="yes"]',
        '["leisure"="marina"]',
      ];
    case "anchorages":
      return ['["seamark:type"~"^(anchorage|anchor_berth)$"]'];
    case "navigation":
      return [
        '["seamark:type"~"^(buoy_.*|beacon_.*|light_major|light_minor|lighthouse|pilot_boarding|fairway|navigation_line|separation_lane|separation_zone|separation_line|separation_boundary|separation_roundabout|restricted_area)$"]',
      ];
    case "cables":
      return [
        '["man_made"="submarine_cable"]',
        '["power"="cable"]["location"="underwater"]',
        '["communication"="line"]["location"="underwater"]',
        '["seamark:type"="cable_submarine"]',
      ];
    case "pipelines":
      return [
        '["man_made"="pipeline"]["location"="underwater"]',
        '["seamark:type"="pipeline_submarine"]',
      ];
    case "offshore":
      return [
        '["man_made"="offshore_platform"]',
        '["man_made"="petroleum_well"]["offshore"="yes"]',
        '["man_made"="petroleum_well"]["location"="offshore"]',
        '["generator:source"="wind"]["offshore"="yes"]',
        '["power"="plant"]["plant:source"="wind"]["offshore"="yes"]',
      ];
    case "heritage":
      return [
        '["historic"="archaeological_site"]["location"="underwater"]',
        '["historic"="archaeological_site"]["submerged"="yes"]',
      ];
    case "protected":
      return [
        '["boundary"="protected_area"]["maritime"="yes"]',
        '["boundary"="protected_area"]["protect_class"="4"]["marine"="yes"]',
      ];
    default:
      return [];
  }
}

interface OsmElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
  center?: { lat: number; lon: number };
  members?: {
    type: string;
    role?: string;
    geometry?: { lat: number; lon: number }[];
  }[];
}

function osmGeometry(
  element: OsmElement,
  layer: MarineLayer,
): { geometry: Geometry; precision: string } | null {
  if (
    element.type === "node" &&
    Number.isFinite(element.lon) &&
    Number.isFinite(element.lat)
  )
    return {
      geometry: { type: "Point", coordinates: [element.lon!, element.lat!] },
      precision: "mapped-point",
    };
  if (element.geometry?.length) {
    const coordinates = element.geometry.map((p) => [p.lon, p.lat]);
    if (coordinates.length < 2) return null;
    const first = coordinates[0],
      last = coordinates[coordinates.length - 1];
    const closed =
      coordinates.length >= 4 && first[0] === last[0] && first[1] === last[1];
    const asArea =
      closed &&
      !["cables", "pipelines"].includes(layer) &&
      element.tags?.area !== "no";
    return {
      geometry: asArea
        ? { type: "Polygon", coordinates: [coordinates] }
        : { type: "LineString", coordinates },
      precision: "mapped-geometry",
    };
  }
  const segments = (element.members ?? [])
    .filter((m) => m.geometry && m.geometry.length >= 2)
    .map((m) => ({
      role: m.role ?? "",
      points: m.geometry!.map((p) => [p.lon, p.lat]),
    }));
  if (segments.length) {
    const outers: Position[][] = [],
      inners: Position[][] = [],
      lines: Position[][] = [];
    for (const role of ["outer", "inner", ""]) {
      const pending = segments
        .filter((s) => s.role === role)
        .map((s) => s.points);
      while (pending.length) {
        const ring = pending.pop()!;
        let joined = true;
        while (joined) {
          joined = false;
          for (let i = pending.length - 1; i >= 0; i--) {
            const next = pending[i];
            const start = ring[0],
              end = ring[ring.length - 1];
            const same = (a: number[], b: number[]) =>
              a[0] === b[0] && a[1] === b[1];
            if (same(end, next[0])) ring.push(...next.slice(1));
            else if (same(end, next[next.length - 1]))
              ring.push(...next.slice(0, -1).reverse());
            else if (same(start, next[next.length - 1]))
              ring.unshift(...next.slice(0, -1));
            else if (same(start, next[0]))
              ring.unshift(...next.slice(1).reverse());
            else continue;
            pending.splice(i, 1);
            joined = true;
          }
        }
        const closed =
          ring.length >= 4 &&
          ring[0][0] === ring[ring.length - 1][0] &&
          ring[0][1] === ring[ring.length - 1][1];
        if (closed && role === "outer") outers.push(ring);
        else if (closed && role === "inner") inners.push(ring);
        else lines.push(ring);
      }
    }
    if (outers.length) {
      // Associate source holes with containing outer rings, avoiding invented areas.
      const inside = (point: Position, ring: Position[]) => {
        let result = false;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const a = ring[i],
            b = ring[j];
          if (
            a[1] > point[1] !== b[1] > point[1] &&
            point[0] <
              ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
          )
            result = !result;
        }
        return result;
      };
      return {
        geometry: {
          type: "MultiPolygon",
          coordinates: outers.map((outer) => [
            outer,
            ...inners.filter((inner) => inside(inner[0], outer)),
          ]),
        },
        precision: "mapped-geometry",
      };
    }
    return {
      geometry: {
        type: "MultiLineString",
        coordinates: lines.length ? lines : segments.map((s) => s.points),
      },
      precision: "mapped-geometry",
    };
  }
  if (element.center)
    return {
      geometry: {
        type: "Point",
        coordinates: [element.center.lon, element.center.lat],
      },
      precision: "source-centroid",
    };
  return null;
}

async function osm(
  layer: MarineLayer,
  bbox: MarineBbox,
  signal: AbortSignal,
): Promise<MarineCollection> {
  const selectors = osmSelectors(layer);
  const query = `[out:json][timeout:10][maxsize:16777216];(${boxes(bbox)
    .flatMap(([w, s, e, n]) =>
      selectors.map((selector) => `nwr${selector}(${s},${w},${n},${e});`),
    )
    .join("")});out geom ${MAX_FEATURES + 1};`;
  let value: any = null;
  for (const endpoint of OVERPASS) {
    try {
      const requestSignal = AbortSignal.any([
        signal,
        AbortSignal.timeout(7000),
      ]);
      value = await boundedJson(
        endpoint,
        requestSignal,
        new URLSearchParams({ data: query }).toString(),
      );
      if (!Array.isArray(value.elements))
        throw new Error("Invalid Overpass response");
      break;
    } catch {
      value = null;
      if (signal.aborted) throw new Error("Marine request timed out");
    }
  }
  if (!value) throw new Error("OpenStreetMap source unavailable");
  const features: Feature<Geometry>[] = [];
  for (const e of (value.elements as OsmElement[]).slice(0, MAX_FEATURES)) {
    const result = osmGeometry(e, layer);
    if (!result || !cleanGeometry(result.geometry)) continue;
    const tags = e.tags ?? {};
    const id = `osm-${e.type}-${e.id}`;
    const publicTags = Object.fromEntries(
      Object.entries(tags)
        .filter(
          ([key]) =>
            key.startsWith("seamark:") ||
            [
              "ref",
              "operator",
              "harbour",
              "marina",
              "historic",
              "location",
              "protect_class",
              "protection_title",
              "depth",
              "substance",
              "power",
              "generator:source",
              "start_date",
              "wikipedia",
              "wikidata",
            ].includes(key),
        )
        .slice(0, 60)
        .map(([key, val]) => [key, text(val)]),
    );
    features.push({
      type: "Feature",
      id,
      geometry: result.geometry,
      properties: {
        ...publicTags,
        id,
        name: text(tags.name || tags["seamark:name"] || tags["name:en"]),
        kind: tags["seamark:type"] || tags.man_made || tags.historic || layer,
        source: "OpenStreetMap contributors / OpenSeaMap",
        sourceUrl: `https://www.openstreetmap.org/${e.type}/${e.id}`,
        license: "ODbL 1.0",
        updatedAt: value.osm3s?.timestamp_osm_base ?? null,
        precision: result.precision,
        projectStatus: text(
          tags["seamark:status"] ||
            tags.status ||
            (tags.construction
              ? "construction"
              : tags.proposed
                ? "planned"
                : ""),
        ),
      },
    });
  }
  const truncated = value.elements.length > MAX_FEATURES;
  return {
    type: "FeatureCollection",
    features,
    metadata: metadata(layer, {
      source: "OpenStreetMap / OpenSeaMap",
      sourceUrl: OSM_SOURCE,
      license: "ODbL 1.0",
      updatedAt: value.osm3s?.timestamp_osm_base ?? null,
      fetchedAt: new Date().toISOString(),
      truncated,
      status: truncated ? "partial" : features.length ? "ready" : "empty",
      message: truncated
        ? "mapData.partial"
        : features.length
          ? "mapData.available"
          : "mapData.noFeatures",
    }),
  };
}

type WfsSpec = {
  type: string;
  kind: string;
  sourceDate: string | null;
  sourceUrl?: string;
  license?: string;
  filter?: string;
  endpoint?: string;
  source?: string;
};
function wfsSpecs(layer: MarineLayer): WfsSpec[] {
  switch (layer) {
    case "cables":
      return [
        "maltacables",
        "shomcables",
        "sigcables",
        "bshcontiscables",
        "cicacables",
        "rijkscables",
        "ukfibrecables",
        "pcablesbshcontis",
        "pcablesshom",
        "pcablesrijks",
        "pcablesnve",
      ].map((type) => ({ type, kind: "submarine_cable", sourceDate: null }));
    case "pipelines":
      return [{ type: "pipelines", kind: "pipeline", sourceDate: null }];
    case "offshore":
      return [
        { type: "platforms", kind: "offshore_platform", sourceDate: null },
        { type: "windfarmspoly", kind: "wind_farm", sourceDate: "2026-07-10" },
      ];
    case "wrecks":
      return [
        {
          type: "wwshipwrecks",
          kind: "wreck",
          sourceDate: null,
          license: "UK Open Government Licence v3; EMODnet CC BY 4.0",
          sourceUrl: CATALOG.wrecks.sourceUrl,
        },
      ];
    case "heritage":
      return [
        {
          type: "heritageshipwrecks",
          kind: "heritage_wreck",
          sourceDate: "2025-04-09",
          sourceUrl: CATALOG.heritage.sourceUrl,
        },
        ...["bgs:P_Archaeological_Site", "bgs:PG_Archaeological_Site"].map(
          (type) => ({
            type,
            kind: "submerged_archaeological_site",
            sourceDate: "2024-10-29",
            endpoint: "https://drive.emodnet-geology.eu/geoserver/bgs/wfs",
            source: "British Geological Survey / EMODnet Geology",
            sourceUrl:
              "https://metadata.europe-geology.eu/record/basic/6720a135-d4b4-49cc-866c-445f0a010855",
          }),
        ),
      ];
    case "protected":
      return [
        {
          type: "natura2000areas",
          kind: "marine_protected_area",
          sourceDate: "2025-12",
          filter: "coast_mar=1",
          sourceUrl: CATALOG.protected.sourceUrl,
        },
      ];
    default:
      return [];
  }
}

async function wfs(
  spec: WfsSpec,
  bbox: MarineBbox,
  signal: AbortSignal,
): Promise<Feature<Geometry>[]> {
  const features: Feature<Geometry>[] = [];
  for (const b of boxes(bbox)) {
    const params = new URLSearchParams({
      service: "WFS",
      version: "1.0.0",
      request: "GetFeature",
      typeName: spec.type.includes(":") ? spec.type : `emodnet:${spec.type}`,
      outputFormat: "application/json",
      srsName: "EPSG:4326",
      maxFeatures: String(MAX_FEATURES + 1),
      bbox: `${b.join(",")},EPSG:4326`,
    });
    // Combine spatial and attribute constraints in CQL when selecting coastal Natura sites.
    if (spec.filter) {
      params.delete("bbox");
      params.set(
        "cql_filter",
        `BBOX(the_geom,${b.join(",")},'EPSG:4326') AND ${spec.filter}`,
      );
    }
    const value = await boundedJson(
      `${spec.endpoint ?? WFS}?${params}`,
      signal,
    );
    if (value.type !== "FeatureCollection" || !Array.isArray(value.features))
      throw new Error("Invalid EMODnet response");
    for (const f of value.features) {
      const geometry = cleanGeometry(f.geometry);
      if (!geometry) continue;
      const p = f.properties ?? {};
      const id = `emodnet-${f.id}`;
      const name =
        [
          "name",
          "NAME",
          "sitename",
          "site_name",
          "wreck_name",
          "Name",
          "NAME_1",
        ]
          .map((key) => text(p[key]))
          .find(
            (name) =>
              !!name && !["n/a", "n/d", "unknown"].includes(name.toLowerCase()),
          ) ?? "";
      const properties = Object.fromEntries(
        Object.entries(p)
          .filter(
            ([, val]) =>
              val === null ||
              ["string", "number", "boolean"].includes(typeof val),
          )
          .slice(0, 80)
          .map(([key, val]) => [
            key,
            typeof val === "string" ? text(val, 1000) : val,
          ]),
      );
      features.push({
        type: "Feature",
        id,
        geometry,
        properties: {
          ...properties,
          id,
          name,
          kind: spec.kind,
          source:
            spec.source ??
            (spec.type === "wwshipwrecks"
              ? "UK Hydrographic Office / EMODnet"
              : "EMODnet Human Activities"),
          sourceUrl: spec.sourceUrl ?? EMODNET_SOURCE,
          license: spec.license ?? "CC BY 4.0",
          updatedAt:
            typeof p.last_amend === "string" &&
            /^\d{4}-\d{2}-\d{2}/.test(p.last_amend)
              ? p.last_amend
              : spec.sourceDate,
          precision:
            p.point_info ||
            (p.position_m && p.position_m !== "n/a"
              ? p.position_m
              : "source-geometry; positional accuracy varies"),
          projectStatus: text(
            p.current_status || p.status || p.Status || p.STATUS,
          ),
        },
      });
    }
  }
  return features;
}

const cache = new Map<
  string,
  { at: number; bytes: number; value: MarineCollection }
>();
const inFlight = new Map<string, Promise<MarineCollection>>();
let activeRequests = 0;
let cacheBytes = 0;

function capResponse(
  value: MarineCollection,
  bbox: MarineBbox,
): MarineCollection {
  const limit = 4_000_000;
  if (Buffer.byteLength(JSON.stringify(value), "utf8") <= limit) return value;
  const width = bbox[0] > bbox[2] ? 360 - bbox[0] + bbox[2] : bbox[2] - bbox[0];
  const centerLon = ((bbox[0] + width / 2 + 540) % 360) - 180;
  const centerLat = (bbox[1] + bbox[3]) / 2;
  const distance = (feature: Feature<Geometry>) => {
    let x = Number(feature.properties?.x_1),
      y = Number(feature.properties?.y_1);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      if (feature.geometry.type === "GeometryCollection") return Infinity;
      let first: any = feature.geometry.coordinates;
      while (Array.isArray(first[0])) first = first[0];
      x = first[0];
      y = first[1];
    }
    const dx = Math.abs(x - centerLon);
    return Math.min(dx, 360 - dx) ** 2 + (y - centerLat) ** 2;
  };
  const ordered = [...value.features].sort((a, b) => distance(a) - distance(b));
  const selected: Feature<Geometry>[] = [];
  let bytes = 5000; // Reserve metadata and FeatureCollection overhead.
  for (const feature of ordered) {
    const featureBytes = Buffer.byteLength(JSON.stringify(feature), "utf8") + 1;
    if (bytes + featureBytes > limit) continue;
    selected.push(feature);
    bytes += featureBytes;
  }
  if (!selected.length) throw new Error("Marine result exceeds response limit");
  return {
    ...value,
    features: selected,
    metadata: {
      ...value.metadata,
      complete: false,
      status: "partial",
      truncated: true,
      message: "mapData.partial",
    },
  };
}

function putCache(key: string, value: MarineCollection) {
  const bytes = JSON.stringify(value).length * 2;
  if (bytes > MAX_CACHE_BYTES / 2) return;
  const previous = cache.get(key);
  if (previous) {
    cacheBytes -= previous.bytes;
    cache.delete(key);
  }
  while (
    cache.size >= MAX_CACHE_ENTRIES ||
    cacheBytes + bytes > MAX_CACHE_BYTES
  ) {
    const oldestKey = cache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    cacheBytes -= cache.get(oldestKey)!.bytes;
    cache.delete(oldestKey);
  }
  cache.set(key, { at: Date.now(), bytes, value });
  cacheBytes += bytes;
}

async function resolveMarine(
  layer: MarineLayer,
  bbox: MarineBbox,
  zoom: number,
  signal: AbortSignal,
): Promise<MarineCollection> {
  if (BOUNDARIES.has(layer) || layer === "ports") {
    let data = await snapshot(
      layer === "eez" && zoom >= 5 && area(bbox) <= 700 ? "eez-detail" : layer,
    );
    let features = data.features.filter((f) =>
      geometryIntersects(f.geometry, bbox),
    );
    if (
      layer === "eez" &&
      Buffer.byteLength(JSON.stringify(features), "utf8") > 3_980_000
    ) {
      data = await snapshot("eez");
      features = data.features.filter((feature) =>
        geometryIntersects(feature.geometry, bbox),
      );
    }
    if (layer === "ports" && (zoom < 6 || area(bbox) > 700)) {
      const fields = new Set([
        "id",
        "name",
        "kind",
        "source",
        "sourceUrl",
        "license",
        "updatedAt",
        "precision",
        "unlocode",
        "wpi_cc",
        "harbor_type_code",
        "harbor_size_code",
        "channel_depth",
        "maxvessellength",
        "maxvesselbeam",
        "maxvesseldraft",
      ]);
      features = features.map((feature) => ({
        ...feature,
        properties: Object.fromEntries(
          Object.entries(feature.properties ?? {}).filter(([key]) =>
            fields.has(key),
          ),
        ),
      }));
    }
    const base = {
      type: "FeatureCollection" as const,
      features,
      metadata: {
        ...data.metadata,
        minZoom: CATALOG[layer].minZoom,
        status: (features.length
          ? "ready"
          : "empty") as MarineMetadata["status"],
        message: features.length ? data.metadata.message : "mapData.noFeatures",
      },
    };
    if (layer !== "ports" || zoom < 9 || area(bbox) > 15) return base;
    try {
      const details = await osm(layer, bbox, signal);
      return {
        ...base,
        features: [...features, ...details.features],
        metadata: metadata(layer, {
          updatedAt: data.metadata.updatedAt,
          fetchedAt: details.metadata.fetchedAt,
          status: details.metadata.status === "partial" ? "partial" : "ready",
          message: details.metadata.message,
        }),
      };
    } catch {
      return {
        ...base,
        metadata: {
          ...base.metadata,
          status: "partial",
          message: "mapData.partial",
        },
      };
    }
  }
  if (layer === "anchorages" || layer === "navigation") {
    try {
      return await osm(layer, bbox, signal);
    } catch (error) {
      if (layer !== "anchorages") throw error;
      const backup = await snapshot("anchorages");
      const features = backup.features.filter((feature) =>
        geometryIntersects(feature.geometry, bbox),
      );
      if (!features.length) throw error;
      return {
        type: "FeatureCollection",
        features,
        metadata: {
          ...backup.metadata,
          minZoom: CATALOG.anchorages.minZoom,
          status: "partial",
          message: "mapData.datedSnapshot",
          complete: false,
        },
      };
    }
  }
  const specs = wfsSpecs(layer);
  const results: PromiseSettledResult<
    Feature<Geometry>[] | MarineCollection
  >[] = [];
  // Provider requests are limited to two at a time. OSM runs only for a local view.
  for (let start = 0; start < specs.length; start += 2) {
    results.push(
      ...(await Promise.allSettled(
        specs.slice(start, start + 2).map((spec) => wfs(spec, bbox, signal)),
      )),
    );
  }
  if (layer !== "wrecks" && area(bbox) <= 100)
    results.push(...(await Promise.allSettled([osm(layer, bbox, signal)])));
  const features: Feature<Geometry>[] = [];
  let failures = 0,
    sources = 0;
  for (const result of results) {
    if (result.status === "rejected") {
      failures++;
      continue;
    }
    sources++;
    features.push(
      ...(Array.isArray(result.value) ? result.value : result.value.features),
    );
  }
  if (!sources) throw new Error("All marine data sources failed");
  const unique = [...new Map(features.map((f) => [String(f.id), f])).values()];
  const truncated = unique.length > MAX_FEATURES;
  const partial = failures > 0 || truncated;
  const sourceDates = specs
    .map((spec) => spec.sourceDate)
    .filter((d): d is string => d !== null)
    .sort();
  return {
    type: "FeatureCollection",
    features: unique.slice(0, MAX_FEATURES),
    metadata: metadata(layer, {
      fetchedAt: new Date().toISOString(),
      updatedAt: sourceDates.length === specs.length ? sourceDates[0] : null,
      truncated,
      status: partial ? "partial" : unique.length ? "ready" : "empty",
      message: partial
        ? "mapData.partial"
        : unique.length
          ? "mapData.available"
          : "mapData.noFeatures",
    }),
  };
}

export async function getMarineData(
  layer: MarineLayer,
  bbox: MarineBbox,
  zoom: number,
): Promise<MarineCollection> {
  if (zoom < CATALOG[layer].minZoom)
    return {
      type: "FeatureCollection",
      features: [],
      metadata: metadata(layer, {
        status: "zoom-required",
        message: "mapData.zoomRequired",
      }),
    };
  if (
    !BOUNDARIES.has(layer) &&
    layer !== "ports" &&
    area(bbox) > (layer === "anchorages" || layer === "navigation" ? 15 : 700)
  )
    return {
      type: "FeatureCollection",
      features: [],
      metadata: metadata(layer, {
        status: "zoom-required",
        message: "mapData.areaTooLarge",
      }),
    };
  const key = `${layer}:${Math.floor(zoom)}:${bbox.map((n) => n.toFixed(3)).join(",")}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < TTL) return cached.value;
  const running = inFlight.get(key);
  if (running) return running;
  if (activeRequests >= 5) return marineError(layer);
  activeRequests++;
  const pending = resolveMarine(layer, bbox, zoom, AbortSignal.timeout(18000))
    .then((result) => {
      const value = capResponse(result, bbox);
      if (
        value.metadata.status !== "error" &&
        value.metadata.status !== "partial"
      )
        putCache(key, value);
      return value;
    })
    .catch(() => marineError(layer))
    .finally(() => {
      activeRequests--;
      inFlight.delete(key);
    });
  inFlight.set(key, pending);
  return pending;
}

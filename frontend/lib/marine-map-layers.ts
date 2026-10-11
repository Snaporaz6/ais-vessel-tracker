import type {
  Map as MarineMap,
  MapGeoJSONFeature,
  ExpressionSpecification,
} from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import type { LayerDefinition } from "./map-layer-catalog";

export type LayerMetadata = {
  cacheExpiresAt?: number;
  source?: string;
  sourceUrl?: string;
  license?: string;
  coverage?: string;
  updatedAt?: string | null;
  fetchedAt?: string | null;
  checkedAt?: string | null;
  complete?: boolean;
  forecastValidTime?: string;
  unmappedCount?: number;
  status?: string;
  message?: string;
  minZoom?: number;
  count?: number;
  sources?: {
    name?: string;
    source?: string;
    url?: string;
    attribution?: string;
    licenseUrl?: string;
    sourceUrl?: string;
    status?: string;
    message?: string;
    fetchedAt?: string | null;
    checkedAt?: string | null;
    updatedAt?: string | null;
    count?: number;
    unmappedCount?: number;
  }[];
};
export type MarineCollection = FeatureCollection & { metadata: LayerMetadata };
export const EMPTY_MARINE: FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};
export function viewportBounds(
  map: MarineMap,
): [number, number, number, number] {
  const bounds = map.getBounds();
  if (bounds.getEast() - bounds.getWest() >= 359)
    return [
      -180,
      Math.max(-85, bounds.getSouth()),
      180,
      Math.min(85, bounds.getNorth()),
    ];
  const wrap = (longitude: number) =>
    ((((longitude + 180) % 360) + 360) % 360) - 180;
  return [
    wrap(bounds.getWest()),
    Math.max(-85, bounds.getSouth()),
    wrap(bounds.getEast()),
    Math.min(85, bounds.getNorth()),
  ];
}
export function sourceId(id: string) {
  return `marine-${id}`;
}
export function marineLayerIds(id: string) {
  return ["fill", "line", "point", "label"].map(
    (suffix) => `${sourceId(id)}-${suffix}`,
  );
}
export function removeMarineLayer(map: MarineMap, id: string) {
  for (const layer of marineLayerIds(id).reverse())
    if (map.getLayer(layer)) map.removeLayer(layer);
  if (map.getSource(sourceId(id))) map.removeSource(sourceId(id));
}
export function addMarineLayer(map: MarineMap, definition: LayerDefinition) {
  const source = sourceId(definition.id),
    [fill, line, point, label] = marineLayerIds(definition.id);
  const before =
    definition.id === "ports"
      ? "clusters"
      : (map
          .getStyle()
          .layers.find(
            (layer) =>
              layer.type === "symbol" &&
              !layer.id.startsWith("marine-") &&
              !layer.id.includes("bathymetry"),
          )?.id ?? "clusters");
  const osm =
    '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors · ODbL</a>';
  const emodnet =
    '<a href="https://emodnet.ec.europa.eu" target="_blank" rel="noopener">EMODnet · CC BY 4.0</a>';
  const jurisdiction = [
    "internal",
    "territorial",
    "contiguous",
    "eez",
    "highseas",
    "shelf",
  ].includes(definition.id);
  const attribution =
    definition.id === "warnings"
      ? '<a href="https://msi.nga.mil" target="_blank" rel="noopener">NGA</a> / <a href="https://www.maritime.dot.gov/msci" target="_blank" rel="noopener">MARAD</a> / <a href="https://www.ukmto.org" target="_blank" rel="noopener">UKMTO · OGL</a>'
      : definition.id === "ports"
        ? '<a href="https://msi.nga.mil/Publications/WPI" target="_blank" rel="noopener">NGA WPI</a> / ' +
          osm
        : jurisdiction
          ? '<a href="https://marineregions.org" target="_blank" rel="noopener">Marine Regions / VLIZ · CC BY 4.0</a>'
          : definition.id === "waves" || definition.id === "currents"
            ? '<a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo / DWD / Météo-France / Copernicus Marine · CC BY 4.0</a>'
            : definition.id === "position-age"
              ? "AIS Vessel Tracker"
              : definition.id === "wrecks"
                ? emodnet +
                  ' / <a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/" target="_blank" rel="noopener">UKHO · OGL v3</a>'
                : emodnet + " / " + osm;
  const uncertain: ExpressionSpecification = [
    "match",
    ["coalesce", ["get", "pol_type"], ""],
    ["Overlapping claim", "Joint regime", "ECS Submission"],
    true,
    false,
  ];
  const boundaryColor: ExpressionSpecification = [
    "case",
    uncertain,
    "#bda08c",
    definition.color,
  ];
  const warningColor: ExpressionSpecification = [
    "case",
    ["==", ["get", "active"], true],
    definition.color,
    "#a7b5c3",
  ];
  map.addSource(source, {
    type: "geojson",
    data: EMPTY_MARINE,
    tolerance: 0.4,
    maxzoom: 13,
    attribution,
  });
  map.addLayer(
    {
      id: fill,
      type: "fill",
      source,
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: {
        "fill-color":
          definition.id === "warnings"
            ? warningColor
            : jurisdiction
              ? boundaryColor
              : definition.color,
        "fill-opacity": definition.id === "warnings" ? 0.13 : 0.05,
      },
    },
    before,
  );
  map.addLayer(
    {
      id: line,
      type: "line",
      source,
      filter: ["!=", ["geometry-type"], "Point"],
      paint: {
        "line-color":
          definition.id === "warnings"
            ? warningColor
            : jurisdiction
              ? boundaryColor
              : definition.color,
        "line-width": definition.id === "warnings" ? 1.8 : 1,
        "line-opacity": 0.7,
        "line-dasharray": definition.id === "territorial" ? [4, 1] : [2, 2],
      },
    },
    before,
  );
  if (definition.id === "ports") {
    if (!map.hasImage("port-anchor")) {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 64;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#146488";
      ctx.strokeStyle = "#eaf8ff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(32, 32, 27, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(32, 18, 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(32, 23);
      ctx.lineTo(32, 47);
      ctx.moveTo(23, 28);
      ctx.lineTo(41, 28);
      ctx.moveTo(16, 35);
      ctx.quadraticCurveTo(17, 47, 32, 48);
      ctx.quadraticCurveTo(47, 47, 48, 35);
      ctx.moveTo(14, 39);
      ctx.lineTo(16, 34);
      ctx.lineTo(21, 37);
      ctx.moveTo(43, 37);
      ctx.lineTo(48, 34);
      ctx.lineTo(50, 39);
      ctx.stroke();
      map.addImage("port-anchor", ctx.getImageData(0, 0, 64, 64), {
        pixelRatio: 2,
      });
    }
    map.addLayer(
      {
        id: point,
        type: "symbol",
        source,
        filter: ["==", ["geometry-type"], "Point"],
        layout: {
          "icon-image": "port-anchor",
          "icon-size": [
            "interpolate",
            ["linear"],
            ["zoom"],
            2,
            0.55,
            7,
            0.85,
            12,
            1,
          ],
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "icon-padding": 2,
        },
      },
      before,
    );
  } else {
    map.addLayer(
      {
        id: point,
        type: "circle",
        source,
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          "circle-radius":
            definition.id === "warnings"
              ? [
                  "case",
                  ["==", ["get", "precision"], "approximate_region"],
                  10,
                  7,
                ]
              : definition.id === "waves"
                ? 12
                : definition.id === "position-age"
                  ? 10
                  : 4,
          "circle-color":
            definition.id === "position-age"
              ? [
                  "step",
                  ["get", "ageMinutes"],
                  "#a3b18a",
                  60,
                  "#d7ad68",
                  360,
                  "#bc7c70",
                ]
              : definition.id === "warnings"
                ? warningColor
                : definition.color,
          "circle-opacity":
            definition.id === "position-age"
              ? 0.18
              : definition.id === "waves"
                ? 0.2
                : definition.id === "warnings"
                  ? [
                      "case",
                      ["==", ["get", "precision"], "approximate_region"],
                      0.15,
                      0.8,
                    ]
                  : 0.8,
          "circle-stroke-color":
            definition.id === "warnings" ? warningColor : definition.color,
          "circle-stroke-width": 1,
        },
      },
      before,
    );
  }
  map.addLayer(
    {
      id: label,
      type: "symbol",
      source,
      ...(definition.id === "ports"
        ? {
            filter: [
              "==",
              ["geometry-type"],
              "Point",
            ] as import("maplibre-gl").FilterSpecification,
          }
        : {}),
      minzoom:
        definition.id === "warnings" ||
        definition.id === "waves" ||
        definition.id === "currents"
          ? 2
          : 6,
      layout: {
        "text-field":
          definition.id === "warnings"
            ? "⚠"
            : definition.id === "waves"
              ? ["concat", ["to-string", ["get", "waveHeight"]], " m"]
              : definition.id === "currents"
                ? "↑"
                : ["coalesce", ["get", "name"], ""],
        "text-size":
          definition.id === "currents"
            ? 24
            : definition.id === "warnings"
              ? 17
              : 11,
        "text-rotate":
          definition.id === "currents"
            ? ["coalesce", ["get", "currentDirection"], 0]
            : 0,
        "text-rotation-alignment": "map",
        "text-offset":
          definition.id === "waves" ||
          definition.id === "warnings" ||
          definition.id === "currents"
            ? [0, 0]
            : [0, definition.id === "ports" ? 1.8 : 1.1],
        "text-padding": 10,
      },
      paint: {
        "text-color":
          definition.id === "warnings" ? "#fff1d1" : definition.color,
        "text-halo-color": "#101a23",
        "text-halo-width": 1.5,
      },
    },
    before,
  );
}
export function featureDetails(feature: MapGeoJSONFeature) {
  return {
    type: "Feature" as const,
    geometry: feature.geometry,
    properties: { ...feature.properties },
  };
}

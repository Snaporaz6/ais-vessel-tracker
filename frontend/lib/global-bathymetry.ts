import type { Map, VectorSourceSpecification } from "maplibre-gl";

/** GEBCO overview tiles are hosted with the app; no live WMS is required. */
export const GLOBAL_BATHYMETRY_SOURCE = "global-bathymetry";
export const GLOBAL_BATHYMETRY_LAYERS = [
  "global-bathymetry-deep",
  "global-bathymetry-med-overview",
  "global-bathymetry-shelf",
  "global-bathymetry-labels",
] as const;

export const GLOBAL_BATHYMETRY_METADATA = {
  source: "GEBCO 2025 / GMT",
  sourceUrl:
    "https://www.generic-mapping-tools.org/remote-datasets/earth-gebco.html",
  doi: "https://doi.org/10.5285/37c52e96-24ea-67ce-e063-7086abc05f29",
  manifestUrl: "/bathymetry/global-manifest.json",
  gridSpacingArcMinutes: 6,
  generalized: true,
  notForNavigation: true,
} as const;

export function globalBathymetrySource(
  baseUrl: string,
): VectorSourceSpecification {
  return {
    type: "vector",
    tiles: [
      new URL("/bathymetry/global-tiles/{z}/{x}/{y}.pbf", baseUrl).href
        .replaceAll("%7B", "{")
        .replaceAll("%7D", "}"),
    ],
    minzoom: 0,
    maxzoom: 5,
    bounds: [-180, -85.0511287798066, 180, 85.0511287798066],
    attribution:
      '<a href="https://doi.org/10.5285/37c52e96-24ea-67ce-e063-7086abc05f29" target="_blank" rel="noopener">GEBCO 2025</a> · <a href="https://www.generic-mapping-tools.org/remote-datasets/earth-gebco.html" target="_blank" rel="noopener">GMT generalized grid</a>',
  };
}

type Options = {
  visible?: boolean;
  beforeId?: string;
  baseUrl?: string;
};

/** Call after style.load. Pass a land/base-label layer as beforeId. */
export function addGlobalBathymetry(map: Map, options: Options = {}): void {
  const visible = options.visible !== false;
  const baseUrl = options.baseUrl ?? window.location.origin;
  const beforeId =
    options.beforeId && map.getLayer(options.beforeId)
      ? options.beforeId
      : undefined;
  if (!map.getSource(GLOBAL_BATHYMETRY_SOURCE)) {
    map.addSource(GLOBAL_BATHYMETRY_SOURCE, globalBathymetrySource(baseUrl));
  }
  const visibility = visible ? "visible" : "none";
  const common = {
    source: GLOBAL_BATHYMETRY_SOURCE,
    "source-layer": "contours",
  };
  if (!map.getLayer(GLOBAL_BATHYMETRY_LAYERS[0])) {
    map.addLayer(
      {
        ...common,
        id: GLOBAL_BATHYMETRY_LAYERS[0],
        type: "line",
        minzoom: 1,
        filter: [
          "all",
          ["==", ["get", "region"], "global"],
          [">=", ["get", "depth"], 1000],
        ],
        layout: { visibility, "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#648797",
          "line-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            1,
            0.18,
            2,
            0.24,
            4,
            0.55,
            7,
            0.6,
          ],
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            2,
            0.5,
            5,
            0.9,
            10,
            1.15,
          ],
        },
      },
      beforeId,
    );
  }
  if (!map.getLayer(GLOBAL_BATHYMETRY_LAYERS[1])) {
    map.addLayer(
      {
        ...common,
        id: GLOBAL_BATHYMETRY_LAYERS[1],
        type: "line",
        minzoom: 1,
        maxzoom: 4,
        filter: [
          "all",
          ["==", ["get", "region"], "mediterranean"],
          [">=", ["get", "depth"], 1000],
        ],
        layout: { visibility, "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#648797",
          "line-opacity": 0.3,
          "line-width": 0.6,
        },
      },
      beforeId,
    );
  }
  if (!map.getLayer(GLOBAL_BATHYMETRY_LAYERS[2])) {
    map.addLayer(
      {
        ...common,
        id: GLOBAL_BATHYMETRY_LAYERS[2],
        type: "line",
        minzoom: 5,
        filter: [
          "all",
          ["==", ["get", "region"], "global"],
          ["<=", ["get", "depth"], 500],
        ],
        layout: { visibility, "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#648797",
          "line-opacity": 0.42,
          "line-width": 0.7,
        },
      },
      beforeId,
    );
  }
  if (!map.getLayer(GLOBAL_BATHYMETRY_LAYERS[3])) {
    map.addLayer(
      {
        ...common,
        id: GLOBAL_BATHYMETRY_LAYERS[3],
        type: "symbol",
        minzoom: 4,
        filter: [
          "all",
          ["==", ["get", "region"], "global"],
          [">=", ["get", "depth"], 1000],
        ],
        layout: {
          visibility,
          "symbol-placement": "line",
          "symbol-spacing": 360,
          "text-field": ["concat", ["to-string", ["get", "depth"]], " m"],
          "text-size": 10,
          "text-font": ["Open Sans Regular"],
          "text-max-angle": 25,
          "text-padding": 8,
        },
        paint: {
          "text-color": "#a2bac5",
          "text-opacity": 0.8,
          "text-halo-color": "#263238",
          "text-halo-width": 1.4,
        },
      },
      beforeId,
    );
  }
  setGlobalBathymetryVisibility(map, visible);
}

export function setGlobalBathymetryVisibility(
  map: Map,
  visible: boolean,
): void {
  for (const id of GLOBAL_BATHYMETRY_LAYERS) {
    if (map.getLayer(id))
      map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
  }
}

export function removeGlobalBathymetry(map: Map): void {
  for (const id of [...GLOBAL_BATHYMETRY_LAYERS].reverse()) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource(GLOBAL_BATHYMETRY_SOURCE))
    map.removeSource(GLOBAL_BATHYMETRY_SOURCE);
}

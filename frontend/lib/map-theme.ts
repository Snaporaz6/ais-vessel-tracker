import type { Map } from "maplibre-gl";
export type MapTheme = "dark" | "light" | "ecdis";
const originals = new WeakMap<
  Map,
  globalThis.Map<string, Record<string, unknown>>
>();
/** Recolor in place: preserve camera, sources, workers and event handlers. */
export function applyMapTheme(map: Map, theme: MapTheme) {
  let saved = originals.get(map);
  if (!saved) {
    saved = new globalThis.Map();
    originals.set(map, saved);
  }
  const light = theme !== "dark",
    ecdis = theme === "ecdis";
  const land = ecdis ? "#d8c16e" : "#d4d7da";
  const sea = ecdis ? "#b5d9e8" : "#ffffff";
  if (ecdis && !map.getSource("depth-bands")) {
    map.addSource("depth-bands", {
      type: "vector",
      tiles: [location.origin + "/bathymetry/depth-bands/{z}/{x}/{y}.pbf"],
      minzoom: 0,
      maxzoom: 5,
      attribution:
        '<a href="https://doi.org/10.5285/37c52e96-24ea-67ce-e063-7086abc05f29">GEBCO 2025 / GMT · generalized depth bands</a>',
    });
    map.addLayer(
      {
        id: "depth-bands-fill",
        type: "fill",
        source: "depth-bands",
        "source-layer": "bands",
        maxzoom: 7,
        paint: {
          "fill-color": [
            "match",
            ["get", "minDepth"],
            0,
            "#83b6cc",
            200,
            "#a2ccd9",
            1000,
            "#c7e1e9",
            "#e6f0f2",
          ],
          "fill-opacity": 1,
        },
      },
      "landcover",
    );
  }
  if (
    map.getLayer("depth-bands-fill") &&
    map.getLayoutProperty("depth-bands-fill", "visibility") !==
      (ecdis ? "visible" : "none")
  )
    map.setLayoutProperty(
      "depth-bands-fill",
      "visibility",
      ecdis ? "visible" : "none",
    );
  for (const layer of map.getStyle().layers) {
    if (layer.id === "depth-bands-fill") continue;
    const overlay = /^(marine-|bathymetry-|global-bathymetry-)/.test(layer.id);
    const ais =
      ["clusters", "cluster-count", "vessel-points"].includes(layer.id) ||
      layer.id.startsWith("track") ||
      layer.id.startsWith("vessel-layout-") ||
      layer.id.startsWith("vessel-model-");
    if (ais) continue;
    const colors: Record<string, unknown> = {};
    if (!overlay) {
      if (layer.type === "background") colors["background-color"] = land;
      if (layer.id === "water")
        colors["fill-opacity"] = ecdis ? ["step", ["zoom"], 0.35, 7, 1] : 1;
      if (layer.type === "fill")
        colors["fill-color"] =
          layer.id === "water"
            ? sea
            : layer.id === "water_shadow"
              ? "transparent"
              : layer.id.includes("building")
                ? ecdis
                  ? "#c4ac61"
                  : "#bbc0c5"
                : land;
      if (layer.type === "line")
        colors["line-color"] = layer.id.includes("water")
          ? ecdis
            ? "#5597b5"
            : "#a7b3bc"
          : layer.id.includes("boundary")
            ? "#939ca5"
            : ecdis
              ? "#b5a264"
              : "#adb4bb";
      if (layer.type === "symbol") {
        colors["text-color"] = layer.id.includes("watername")
          ? "#466775"
          : "#3f4c57";
        colors["text-halo-color"] = layer.id.includes("watername") ? sea : land;
      }
    } else {
      if (layer.type === "line" && layer.id.includes("bathymetry"))
        colors["line-color"] = ecdis ? "#4485a3" : "#83a3b4";
      if (layer.type === "symbol") {
        colors["text-halo-color"] = sea;
        if (layer.id.includes("bathymetry")) colors["text-color"] = "#376f8b";
        else if (layer.id.includes("warnings"))
          colors["text-color"] = "#9b4a10";
      }
    }
    if (!Object.keys(colors).length) continue;
    let original = saved.get(layer.id);
    if (!original) {
      original = {};
      for (const key of Object.keys(colors))
        original[key] =
          map.getPaintProperty(
            layer.id,
            key as Parameters<Map["getPaintProperty"]>[1],
          ) ?? null;
      saved.set(layer.id, original);
    }
    for (const [key, value] of Object.entries(colors)) {
      const target = light ? value : original[key];
      if (
        JSON.stringify(
          map.getPaintProperty(
            layer.id,
            key as Parameters<Map["getPaintProperty"]>[1],
          ) ?? null,
        ) !== JSON.stringify(target)
      )
        map.setPaintProperty(
          layer.id,
          key as Parameters<Map["setPaintProperty"]>[1],
          target as Parameters<Map["setPaintProperty"]>[2],
        );
    }
  }
}

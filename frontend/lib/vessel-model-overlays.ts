import {
  MercatorCoordinate,
  type Map as VesselMap,
  type GeoJSONSource,
} from "maplibre-gl";
import type { FeatureCollection, Feature, Geometry } from "geojson";
import { MODEL_SPECS } from "./vessel-models";
import { VESSEL_COLORS } from "./vessel-colors";
import type { ShipType } from "../../shared/types";
import type { VesselPlacement } from "./vessel-model-layout";

const SOURCE = "vessel-layout-overlays";
const IDS = [
  "vessel-layout-leaders",
  "vessel-layout-anchors",
  "vessel-layout-flat",
  "vessel-layout-neutral",
  "vessel-layout-estimated",
];
const imageId = (type: string, neutral: boolean) =>
  `vessel-layout-${type}-${neutral ? "neutral" : "flat"}`;
/** Small shared pictograms, generated once; no downloaded image or per-vessel texture. */
function icon(type: ShipType, neutral: boolean) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const c = canvas.getContext("2d")!;
  c.strokeStyle = "#f8fafc";
  c.lineWidth = 2;
  c.fillStyle = VESSEL_COLORS[type];
  if (neutral) {
    // Side-view category badge deliberately has no geographic bow direction.
    c.beginPath();
    c.roundRect(6, 13, 52, 38, 12);
    c.fillStyle = "#16202c";
    c.fill();
    c.stroke();
    c.fillStyle = VESSEL_COLORS[type];
    c.beginPath();
    c.moveTo(11, 36);
    c.lineTo(53, 36);
    c.lineTo(46, 45);
    c.lineTo(17, 45);
    c.closePath();
    c.fill();
    c.fillRect(18, 25, 11, 11);
    c.fillRect(33, 29, 10, 7);
    if (type === "cargo") {
      c.fillRect(31, 22, 8, 6);
      c.fillRect(41, 22, 8, 6);
    }
    if (type === "passenger") {
      c.fillRect(25, 20, 20, 4);
      c.fillRect(29, 16, 12, 3);
    }
    if (type === "fishing" || type === "tug") {
      c.fillRect(33, 16, 2, 16);
    }
  } else {
    c.beginPath();
    c.moveTo(32, 4);
    c.lineTo(43, 17);
    c.lineTo(45, 24);
    c.lineTo(45, 57);
    c.lineTo(19, 57);
    c.lineTo(19, 24);
    c.lineTo(21, 17);
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = "#17202a";
    c.fillRect(23, 43, 18, 7);
    c.lineWidth = 1.5;
    c.strokeStyle = "#17202a";
    if (type === "cargo") {
      for (let y = 22; y < 42; y += 7)
        for (const x of [23, 33]) c.strokeRect(x, y, 8, 5);
    } else if (type === "tanker") {
      for (const y of [21, 29, 37]) {
        c.beginPath();
        c.ellipse(32, y, 7, 3, 0, 0, 2 * Math.PI);
        c.stroke();
      }
    } else if (type === "passenger" || type === "pleasure") {
      c.strokeRect(25, 20, 14, 20);
      c.strokeRect(28, 25, 8, 12);
    } else {
      c.beginPath();
      c.moveTo(23, 25);
      c.lineTo(41, 38);
      c.moveTo(41, 25);
      c.lineTo(23, 38);
      c.stroke();
    }
  }
  return c.getImageData(0, 0, 64, 64);
}
export function createVesselModelOverlays(map: VesselMap, minzoom: number) {
  const images: string[] = [];
  for (const type of Object.keys(MODEL_SPECS) as ShipType[])
    for (const neutral of [false, true]) {
      const id = imageId(type, neutral);
      map.addImage(id, icon(type, neutral), { pixelRatio: 2 });
      images.push(id);
    }
  const badge = document.createElement("canvas");
  badge.width = badge.height = 32;
  const c = badge.getContext("2d")!;
  c.fillStyle = "#17202a";
  c.beginPath();
  c.arc(16, 16, 14, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#fbbf24";
  c.font = "bold 25px sans-serif";
  c.textAlign = "center";
  c.fillText("≈", 16, 23);
  map.addImage("vessel-layout-approx", c.getImageData(0, 0, 32, 32), {
    pixelRatio: 2,
  });
  images.push("vessel-layout-approx");
  map.addSource(SOURCE, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });
  map.addLayer({
    id: IDS[0],
    type: "line",
    source: SOURCE,
    minzoom,
    filter: ["==", ["get", "kind"], "leader"],
    paint: {
      "line-color": ["get", "color"],
      "line-width": 1.5,
      "line-opacity": 0.7,
      "line-dasharray": [2, 2],
    },
  });
  map.addLayer({
    id: IDS[1],
    type: "circle",
    source: SOURCE,
    minzoom,
    filter: ["==", ["get", "kind"], "anchor"],
    paint: {
      "circle-radius": 2.5,
      "circle-color": ["get", "color"],
      "circle-stroke-color": "#f8fafc",
      "circle-stroke-width": 1,
    },
  });
  for (const [index, neutral] of [
    [2, false],
    [3, true],
  ] as const)
    map.addLayer({
      id: IDS[index],
      type: "symbol",
      source: SOURCE,
      minzoom,
      filter: [
        "all",
        ["==", ["get", "kind"], "flat"],
        ["==", ["get", "neutral"], neutral],
      ],
      layout: {
        "icon-image": ["get", "image"],
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
        "icon-rotation-alignment": neutral ? "viewport" : "map",
        "icon-pitch-alignment": "viewport",
        "icon-rotate": neutral ? 0 : ["get", "heading"],
        "icon-size": 0.85,
      },
      paint: { "icon-opacity": ["case", ["get", "stale"], 0.5, 0.85] },
    });
  map.addLayer({
    id: IDS[4],
    type: "symbol",
    source: SOURCE,
    minzoom,
    filter: ["==", ["get", "kind"], "estimated"],
    layout: {
      "icon-image": "vessel-layout-approx",
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
      "icon-offset": [12, -12],
    },
  });
  let lastKey = "";
  let lastPlacements: VesselPlacement[] | null = null;
  return {
    raise() {
      for (const id of IDS) map.moveLayer(id);
    },
    update(placements: VesselPlacement[]) {
      if (placements === lastPlacements) return;
      lastPlacements = placements;
      const features: Feature<Geometry>[] = [];
      for (const p of placements) {
        const v = p.vessel,
          ll = new MercatorCoordinate(p.center.x, p.center.y).toLngLat();
        const properties = { mmsi: v.mmsi, color: VESSEL_COLORS[v.ship_type] };
        if (p.model && p.displaced) {
          features.push({
            type: "Feature",
            properties: { ...properties, kind: "leader" },
            geometry: {
              type: "LineString",
              coordinates: [
                [v.lon, v.lat],
                [ll.lng, ll.lat],
              ],
            },
          });
          features.push({
            type: "Feature",
            properties: { ...properties, kind: "anchor" },
            geometry: { type: "Point", coordinates: [v.lon, v.lat] },
          });
        }
        if (!p.model)
          features.push({
            type: "Feature",
            properties: {
              ...properties,
              kind: "flat",
              stale: p.stale,
              neutral: p.heading === null || p.estimated,
              heading: p.heading ?? 0,
              image: imageId(v.ship_type, p.heading === null || p.estimated),
            },
            geometry: { type: "Point", coordinates: [v.lon, v.lat] },
          });
        else if (p.estimated)
          features.push({
            type: "Feature",
            properties: { ...properties, kind: "estimated" },
            geometry: { type: "Point", coordinates: [ll.lng, ll.lat] },
          });
      }
      const data: FeatureCollection = { type: "FeatureCollection", features };
      const key = JSON.stringify(data);
      if (key !== lastKey) {
        lastKey = key;
        (map.getSource(SOURCE) as GeoJSONSource)?.setData(data);
      }
    },
    destroy() {
      for (const id of IDS.slice().reverse())
        if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(SOURCE)) map.removeSource(SOURCE);
      for (const id of images) if (map.hasImage(id)) map.removeImage(id);
    },
  };
}

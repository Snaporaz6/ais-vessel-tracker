import type { Map } from "maplibre-gl";
import type { FeatureCollection, Feature, Point, Geometry } from "geojson";
function distance(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) {
  const rad = Math.PI / 180,
    lat = (b.latitude - a.latitude) * rad,
    lon = (b.longitude - a.longitude) * rad;
  const h =
    Math.sin(lat / 2) ** 2 +
    Math.cos(a.latitude * rad) *
      Math.cos(b.latitude * rad) *
      Math.sin(lon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
/** The display marker may move to nearby rendered land; NGA coordinates remain explicit. */
export function onshorePortMarkers(
  map: Map,
  data: FeatureCollection,
): FeatureCollection {
  if (
    map.getZoom() < 7 ||
    !map.getLayer("water") ||
    !map.isSourceLoaded("carto")
  )
    return data;
  const canvas = map.getCanvas();
  const features: Feature<Geometry>[] = [];
  for (const feature of data.features) {
    if (feature.geometry.type !== "Point") {
      features.push(feature);
      continue;
    }
    const origin = feature.geometry.coordinates;
    const pixel = map.project([origin[0], origin[1]]);
    if (
      pixel.x < 0 ||
      pixel.y < 0 ||
      pixel.x > canvas.clientWidth ||
      pixel.y > canvas.clientHeight ||
      !map.queryRenderedFeatures(pixel, { layers: ["water"] }).length
    ) {
      features.push(feature);
      continue;
    }
    let land: [number, number] | undefined;
    for (let radius = 10; radius <= 80 && !land; radius += 10) {
      for (let step = 0; step < 16; step++) {
        const angle = (step * Math.PI) / 8;
        const point: [number, number] = [
          pixel.x + Math.cos(angle) * radius,
          pixel.y + Math.sin(angle) * radius,
        ];
        if (
          point[0] < 0 ||
          point[1] < 0 ||
          point[0] > canvas.clientWidth ||
          point[1] > canvas.clientHeight
        )
          continue;
        if (map.queryRenderedFeatures(point, { layers: ["water"] }).length)
          continue;
        const coord = map.unproject(point);
        if (
          distance(
            { latitude: origin[1], longitude: origin[0] },
            { latitude: coord.lat, longitude: coord.lng },
          ) > 3000
        )
          continue;
        land = [coord.lng, coord.lat];
        break;
      }
    }
    if (!land) {
      features.push(feature);
      continue;
    }
    const properties = {
      ...feature.properties,
      catalogLon: origin[0],
      catalogLat: origin[1],
      displayPlacement: "nearby-rendered-land",
    };
    features.push({
      ...feature,
      properties,
      geometry: { type: "Point", coordinates: land },
    } as Feature<Point>);
    features.push({
      type: "Feature",
      properties: { ...properties, kind: "port-pointer" },
      geometry: { type: "LineString", coordinates: [origin, land] },
    });
  }
  return { type: "FeatureCollection", features };
}

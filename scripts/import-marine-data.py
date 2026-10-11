#!/usr/bin/env python3
"""Import attributed display derivatives, never invented nautical geometry.

Standard library only. Downloads fixed public provider URLs with time/byte/page
bounds, checks record counts/IDs and writes atomically. Run from repository root:
python3 scripts/import-marine-data.py --boundaries
python3 scripts/import-marine-data.py --ports --port-url <official NGA query URL>
"""
import argparse
import concurrent.futures
import datetime
import gzip
import json
import math
import pathlib
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
DEST = ROOT / "frontend/public/marine-data"
RAW_CACHE = pathlib.Path("/private/tmp/ais-marine-import-cache")
WFS = "https://geo.vliz.be/geoserver/MarineRegions/wfs"
BOUNDARIES = {
    "territorial": ("MarineRegions:eez_12nm", "2023-10-25"),
    "contiguous": ("MarineRegions:eez_24nm", "2023-10-25"),
    "eez": ("MarineRegions:eez", "2023-10-25"),
    "internal": ("MarineRegions:eez_internal_waters", "2023-10-25"),
    "highseas": ("MarineRegions:high_seas", "2024-10-10"),
    "shelf": ("MarineRegions:ecs", "2024-10-10"),
}


def get_json(url):
    request = urllib.request.Request(url, headers={"User-Agent": "AISVesselTracker/1.0", "Accept": "application/json", "Accept-Encoding": "gzip"})
    with urllib.request.urlopen(request, timeout=60) as response:
        stream = gzip.GzipFile(fileobj=response) if response.headers.get("Content-Encoding") == "gzip" else response
        data = stream.read(128 * 1024 * 1024 + 1)
        if len(data) > 128 * 1024 * 1024:
            raise ValueError("Provider response exceeds import limit")
        value = json.loads(data)
        if "error" in value:
            raise ValueError("Provider returned an error")
        return value


def save(name, value):
    DEST.mkdir(parents=True, exist_ok=True)
    target = DEST / (name + ".json")
    temporary = target.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(value, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    temporary.replace(target)
    print(name, len(value["features"]), target.stat().st_size, flush=True)


def distance2(point, start, end):
    dx, dy = end[0] - start[0], end[1] - start[1]
    if dx == dy == 0:
        return (point[0] - start[0]) ** 2 + (point[1] - start[1]) ** 2
    t = max(0, min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / (dx * dx + dy * dy)))
    return (point[0] - start[0] - t * dx) ** 2 + (point[1] - start[1] - t * dy) ** 2


def simplify(points, tolerance=0.025):
    if len(points) <= 4:
        return [[round(p[0], 5), round(p[1], 5)] for p in points]
    # Radial prepass plus RDP each use half the tolerance. This bounds the total
    # displacement while avoiding quadratic work on very detailed coastlines.
    radial = [points[0]]
    threshold = (tolerance / 2) ** 2
    for point in points[1:-1]:
        if (point[0] - radial[-1][0]) ** 2 + (point[1] - radial[-1][1]) ** 2 > threshold:
            radial.append(point)
    radial.append(points[-1])
    original = points
    points = radial
    tolerance /= 2
    keep = {0, len(points) - 1}
    pending = [(0, len(points) - 1)]
    while pending:
        left, right = pending.pop()
        max_distance, index = tolerance * tolerance, None
        for i in range(left + 1, right):
            value = distance2(points[i], points[left], points[right])
            if value > max_distance:
                max_distance, index = value, i
        if index is not None:
            keep.add(index)
            pending.extend(((left, index), (index, right)))
    result = [[round(points[i][0], 5), round(points[i][1], 5)] for i in sorted(keep)]
    # Keep three real source vertices for a collapsed display ring. Restoring its
    # complete coastline here would defeat generalisation (and exceed Vercel's
    # response bound). No buffered/guessed positions are introduced.
    if original[0] == original[-1] and len(result) < 4:
        far = max(range(1, len(original) - 1), key=lambda i: distance2(original[i], original[0], original[0]))
        candidates = [i for i in range(1, len(original) - 1) if i != far and original[i] != original[0] and original[i] != original[far]]
        third = max(candidates, key=lambda i: distance2(original[i], original[0], original[far])) if candidates else None
        if third is None:
            raise ValueError("Degenerate source polygon ring")
        indices = sorted({0, far, third, len(original) - 1})
        result = [[round(original[i][0], 5), round(original[i][1], 5)] for i in indices]
    return result


def ring_area(points):
    return abs(sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(points, points[1:]))) / 2


def geometry(value, tolerance=0.025):
    kind, coordinates = value["type"], value["coordinates"]
    if kind in ("Polygon", "MultiPolygon"):
        polygons = [coordinates] if kind == "Polygon" else coordinates
        # Features remain present, but sub-resolution island/hole components are
        # omitted from this display derivative. Their exact geometry is linked
        # at the provider. Keeping collapsed original rings would otherwise make
        # the global response tens of MB even after line simplification.
        threshold = tolerance ** 2
        selected = [polygon for polygon in polygons if polygon and ring_area(polygon[0]) >= threshold]
        if not selected:
            selected = [max(polygons, key=lambda polygon: ring_area(polygon[0]))]
        reduced = [[simplify(polygon[0], tolerance), *[simplify(ring, tolerance) for ring in polygon[1:] if ring_area(ring) >= threshold]] for polygon in selected]
        coordinates = reduced[0] if kind == "Polygon" else reduced
    elif kind == "LineString":
        coordinates = simplify(coordinates, tolerance)
    elif kind == "MultiLineString":
        coordinates = [simplify(line, tolerance) for line in coordinates]
    return {"type": kind, "coordinates": coordinates}


def import_boundary(item):
    layer, (name, updated) = item
    features, detailed_features, identifiers, expected = [], [], set(), None
    tolerance = 0.1 if layer == "eez" else 0.025
    for start in range(0, 2000, 10):
        params = dict(service="WFS", version="2.0.0", request="GetFeature", typeNames=name,
                      outputFormat="application/json", srsName="EPSG:4326", count=10, startIndex=start)
        RAW_CACHE.mkdir(parents=True, exist_ok=True)
        cache = RAW_CACHE / (layer + "-" + str(start) + ".json")
        try:
            data = json.loads(cache.read_text())
        except (FileNotFoundError, json.JSONDecodeError):
            data = get_json(WFS + "?" + urllib.parse.urlencode(params))
            temporary = cache.with_suffix(".tmp")
            temporary.write_text(json.dumps(data, separators=(",", ":")))
            temporary.replace(cache)
        if data.get("type") != "FeatureCollection":
            raise ValueError("Invalid WFS response")
        if expected is None:
            expected = int(data["numberMatched"])
        page = data["features"]
        for feature in page:
            if feature["id"] in identifiers:
                raise ValueError("WFS duplicate record")
            identifiers.add(feature["id"])
            p = feature.get("properties") or {}
            display_name = next((p[k] for k in ("GEONAME", "geoname", "SOVEREIGN1", "sovereign1", "name") if p.get(k)), layer)
            props = {key: value for key, value in p.items() if isinstance(value, (str, int, float, bool)) or value is None}
            props.update({"id": feature["id"], "name": display_name, "kind": layer,
                     "source": "Marine Regions / VLIZ", "sourceUrl": "https://www.marineregions.org/downloads.php",
                     "updatedAt": updated, "precision": "generalised-" + str(tolerance) + "-degrees", "license": "CC BY 4.0"})
            features.append({"type": "Feature", "id": feature["id"], "geometry": geometry(feature["geometry"], tolerance), "properties": props})
            if layer == "eez":
                detailed_features.append({"type": "Feature", "id": feature["id"], "geometry": geometry(feature["geometry"], 0.025), "properties": {**props, "precision": "generalised-0.025-degrees"}})
        print(layer, "source page", start, "records", len(features), "of", expected, flush=True)
        if len(features) >= expected:
            break
        if not page:
            raise ValueError("Incomplete WFS pagination")
    if len(features) != expected or len(identifiers) != expected:
        raise ValueError("WFS record count or uniqueness mismatch")
    result = {"type": "FeatureCollection", "features": features, "metadata": {
        "source": "Marine Regions / VLIZ", "sourceUrl": "https://www.marineregions.org/downloads.php",
        "license": "CC BY 4.0", "coverage": "global", "updatedAt": updated,
        "fetchedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "complete": True, "status": "ready", "message": "mapData.generalised",
        "precision": "Display derivative simplified at " + str(tolerance) + " degrees; sub-resolution islands/holes omitted; collapsed rings retain three real source vertices; no legal or navigational value",
        "sourceFeatureCount": expected}}
    save(layer, result)
    if detailed_features:
        save("eez-detail", {**result, "features": detailed_features, "metadata": {**result["metadata"], "precision": "Display derivative simplified at 0.025 degrees; sub-resolution islands/holes omitted; collapsed rings retain three real source vertices; no legal or navigational value"}})


def import_ports(url):
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != "https" or parsed.hostname != "fgmod.nga.mil":
        raise ValueError("Ports must come from the official NGA service")
    base = url.rstrip("/")
    count = get_json(base + "/query?" + urllib.parse.urlencode(dict(where="1=1", returnCountOnly="true", f="json"))).get("count")
    if not isinstance(count, int) or count < 1000 or count > 20000:
        raise ValueError("Invalid official port count")
    collected = []
    for start in range(0, 20000, 1000):
        params = dict(where="1=1", outFields="*", outSR="4326", f="geojson", resultOffset=start, resultRecordCount=1000)
        data = get_json(base + "/query?" + urllib.parse.urlencode(params))
        features = data.get("features")
        if not isinstance(features, list):
            raise ValueError("Invalid port response")
        collected.extend(features)
        if len(features) < 1000:
            break
    if len(collected) != count:
        raise ValueError("Official port count differs from export")
    features = []
    for f in collected:
        p = f.get("properties") or {}
        g = f.get("geometry")
        if not g or g.get("type") != "Point":
            continue
        fields = ("wpinumber", "main_port_name", "alternate_name", "unlocode", "wpi_cc", "dodwaterbody",
                  "channel_depth", "anchorage_depth", "cargo_pier_depth", "oil_terminal_depth", "lng_terminal_depth",
                  "maxvessellength", "maxvesselbeam", "maxvesseldraft", "harbor_type_code", "harbor_size_code", "shelter_afforded_code",
                  "pilotage_avail", "pilotage_compulsory", "tugs_assist", "repair_code", "supply_fueloil", "supply_h2o",
                  "med_facilities", "quarantine_pratique", "port_security", "ent_restrict_tide", "ent_restrict_swell", "ent_restrict_ice",
                  "ent_restrict_other", "fac_anchor", "fac_container", "fac_roro", "fac_dangcargo", "tss", "vts", "eta_message")
        cleaned = {k: p[k] for k in fields if k in p and (isinstance(p[k], (str, int, float, bool)) or p[k] is None)}
        cleaned.update({"id": str(f.get("id", p.get("objectid", p.get("OBJECTID", p.get("wpinumber"))))),
                        "name": p.get("main_port_name") or p.get("PORT_NAME") or p.get("port_name") or p.get("MAIN_PORT_NAME") or "Port",
                        "kind": "port", "source": "NGA World Port Index", "sourceUrl": "https://msi.nga.mil/Publications/WPI",
                        "updatedAt": None, "precision": "port-location", "license": "Public domain (US NGA)"})
        features.append({"type": "Feature", "id": cleaned["id"], "geometry": g, "properties": cleaned})
    if len({f["id"] for f in features}) != len(features):
        raise ValueError("Duplicate port identifiers")
    save("ports", {"type": "FeatureCollection", "features": features, "metadata": {
        "source": "NGA World Port Index", "sourceUrl": "https://msi.nga.mil/Publications/WPI", "license": "Public domain (US NGA)",
        "coverage": "global selected ports; not every harbour", "updatedAt": None,
        "fetchedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(), "complete": False,
        "status": "ready", "message": "mapData.available", "sourceFeatureCount": len(features)}})


    # Keep frontend and backend NGA IDs/coordinates in the same release.
    catalog_path = ROOT / "shared" / "ports-catalog.json"
    rows = [{"id": str(f["properties"]["id"]), "name": f["properties"]["name"], "unlocode": f["properties"].get("unlocode"), "country": f["properties"].get("wpi_cc"), "lat": f["geometry"]["coordinates"][1], "lon": f["geometry"]["coordinates"][0]} for f in features]
    catalog_path.write_text(json.dumps(rows, separators=(",", ":"), ensure_ascii=False) + "\n", encoding="utf-8")

def import_genoa():
    query = '[out:json][timeout:12];nwr["seamark:type"~"^(anchorage|anchor_berth)$"](44.1,8.4,44.6,9.2);out geom 100;'
    request = urllib.request.Request("https://overpass-api.de/api/interpreter",
        data=urllib.parse.urlencode({"data": query}).encode(),
        headers={"Accept": "application/json", "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "AISVesselTracker/1.0"})
    with urllib.request.urlopen(request, timeout=20) as response:
        data = json.loads(response.read(2 * 1024 * 1024 + 1))
    if data.get("remark") or not data.get("elements"):
        raise ValueError("Anchorage source unavailable")
    updated = data["osm3s"]["timestamp_osm_base"]
    features = []
    for element in data["elements"]:
        if element["type"] == "node":
            g = {"type": "Point", "coordinates": [element["lon"], element["lat"]]}
        elif element["type"] == "way" and len(element.get("geometry", [])) >= 2:
            points = [[p["lon"], p["lat"]] for p in element["geometry"]]
            closed = len(points) >= 4 and points[0] == points[-1]
            g = {"type": "Polygon" if closed else "LineString", "coordinates": [points] if closed else points}
        else:
            raise ValueError("Unsupported anchorage source geometry")
        tags = element.get("tags", {})
        ident = "osm-" + element["type"] + "-" + str(element["id"])
        features.append({"type": "Feature", "id": ident, "geometry": g, "properties": {
            "id": ident, "name": tags.get("name", tags.get("seamark:name", "")), "kind": tags["seamark:type"],
            "source": "OpenStreetMap contributors / OpenSeaMap", "sourceUrl": "https://www.openstreetmap.org/" + element["type"] + "/" + str(element["id"]),
            "license": "ODbL 1.0", "updatedAt": updated, "precision": "mapped-point" if element["type"] == "node" else "mapped-geometry",
            "seamark:information": tags.get("seamark:information", "")}})
    save("anchorages", {"type": "FeatureCollection", "features": features, "metadata": {
        "source": "OpenStreetMap / OpenSeaMap (dated Ligurian viewport snapshot)", "sourceUrl": "https://www.openstreetmap.org/copyright",
        "license": "ODbL 1.0", "coverage": "8.4–9.2 E, 44.1–44.6 N only; community mapping, incomplete",
        "updatedAt": updated, "fetchedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(), "complete": False,
        "status": "partial", "message": "mapData.datedSnapshot", "bbox": [8.4, 44.1, 9.2, 44.6], "sourceFeatureCount": len(features)}})


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--boundaries", action="store_true")
    parser.add_argument("--ports", action="store_true")
    parser.add_argument("--port-url")
    parser.add_argument("--genoa", action="store_true")
    args = parser.parse_args()
    if args.boundaries:
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            list(pool.map(import_boundary, BOUNDARIES.items()))
    if args.ports:
        if not args.port_url:
            parser.error("--port-url is required")
        import_ports(args.port_url)
    if args.genoa:
        import_genoa()

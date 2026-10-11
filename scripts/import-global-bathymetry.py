#!/usr/bin/env python3
"""Build the locally hosted worldwide GEBCO overview contour vector tiles.

Import dependencies (isolated Python environment recommended):
    pip install numpy netCDF4 contourpy shapely mapbox-vector-tile

The 6 arc-minute grid is GMT's Gaussian-filtered GEBCO 2025 derivative, not
the original 15 arc-second grid. These tiles are illustrative, not for navigation.
Only this script's global-tiles directory and global-manifest.json are written.
"""
from __future__ import annotations

import argparse
import datetime
import hashlib
import json
import math
import pathlib
import urllib.request

import contourpy
import mapbox_vector_tile
import netCDF4
import numpy as np
from shapely.geometry import LineString, box
from shapely.ops import transform
from shapely.strtree import STRtree


SOURCE = "https://oceania.generic-mapping-tools.org/server/earth/earth_gebco/earth_gebco_06m_g.grd"
LEVELS = (200, 500, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000)
MERCATOR_LIMIT = 85.0511287798066
EXTENT = 4096
MEDITERRANEAN = box(-6, 30, 36.5, 46)
WORLD = box(-180, -MERCATOR_LIMIT, 180, MERCATOR_LIMIT)
OUT = pathlib.Path(__file__).resolve().parent.parent / "frontend/public/bathymetry"


def line_parts(geometry):
    if geometry.is_empty:
        return
    if geometry.geom_type == "LineString":
        if len(geometry.coords) > 1 and geometry.length > 0:
            yield geometry
    elif hasattr(geometry, "geoms"):
        for part in geometry.geoms:
            yield from line_parts(part)


def mercator(longitude, latitude, z=None):
    longitude = np.asarray(longitude)
    latitude = np.asarray(latitude)
    x = (longitude + 180) / 360
    # Coordinates are north-up for mapbox-vector-tile's default y-axis flip.
    y = (1 + np.log(np.tan(math.pi / 4 + np.deg2rad(latitude) / 2)) / math.pi) / 2
    return x, y


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--grid", type=pathlib.Path, default=pathlib.Path("/tmp/ais-gebco-06m.grd"))
    parser.add_argument("--max-zoom", type=int, default=5, choices=range(0, 7))
    args = parser.parse_args()
    if not args.grid.exists():
        args.grid.parent.mkdir(parents=True, exist_ok=True)
        print("Downloading", SOURCE, flush=True)
        urllib.request.urlretrieve(SOURCE, args.grid)

    with netCDF4.Dataset(args.grid) as dataset:
        title = dataset.title
        description = dataset.description
        if "GEBCO" not in title or "2025" not in title:
            raise ValueError("Expected the documented GMT GEBCO 2025 grid; review metadata before importing a new release")
        longitude = np.asarray(dataset.variables["lon"][:])
        latitude = np.asarray(dataset.variables["lat"][:])
        elevation = np.asarray(dataset.variables["z"][:], dtype=np.float64)

    generator = contourpy.contour_generator(x=longitude, y=latitude, z=elevation, name="serial", line_type="Separate")
    geometries = []
    properties = []
    source_lines = 0
    for depth in LEVELS:
        contours = generator.lines(-depth)
        source_lines += len(contours)
        for coordinates in contours:
            line = LineString(coordinates).intersection(WORLD)
            # Keep an independently styled Mediterranean overview. At zoom >=4
            # the app switches this region to the existing detailed EMODnet data.
            for region, clipped in (("mediterranean", line.intersection(MEDITERRANEAN)), ("global", line.difference(MEDITERRANEAN))):
                for part in line_parts(clipped):
                    geometries.append(transform(mercator, part))
                    properties.append({"depth": depth, "elevation": -depth, "region": region, "source": "GEBCO 2025 / GMT", "generalized": True})
        print("Contours", depth, len(contours), flush=True)

    tree = STRtree(geometries)
    tile_root = OUT / "global-tiles"
    tile_root.mkdir(parents=True, exist_ok=True)
    byte_count = 0
    tiles = 0
    nonempty = 0
    largest_tile = 0
    overview = {}
    for zoom in range(args.max_zoom + 1):
        count = 2 ** zoom
        zoom_bytes = 0
        for x in range(count):
            column = tile_root / str(zoom) / str(x)
            column.mkdir(parents=True, exist_ok=True)
            for y in range(count):
                west, east = x / count, (x + 1) / count
                south, north = 1 - (y + 1) / count, 1 - y / count
                buffer = 8 / EXTENT / count
                bounds = box(west - buffer, south - buffer, east + buffer, north + buffer)
                tolerance = 0.35 / EXTENT / count
                features = []
                for index in tree.query(bounds):
                    geom = geometries[index].intersection(bounds).simplify(tolerance, preserve_topology=False)
                    for part in line_parts(geom):
                        features.append({"geometry": part, "properties": properties[index], "id": int(index)})
                data = mapbox_vector_tile.encode({"name": "contours", "features": features}, default_options={"quantize_bounds": (west, south, east, north), "extents": EXTENT})
                (column / f"{y}.pbf").write_bytes(data)
                tiles += 1
                nonempty += bool(features)
                byte_count += len(data)
                zoom_bytes += len(data)
                largest_tile = max(largest_tile, len(data))
        overview[str(zoom)] = {"tiles": count * count, "bytes": zoom_bytes}
        print("Zoom", zoom, overview[str(zoom)], flush=True)

    manifest = {
        "schemaVersion": 1,
        "name": "Worldwide generalized bathymetric contours",
        "source": SOURCE,
        "sourceDocumentation": "https://www.generic-mapping-tools.org/remote-datasets/earth-gebco.html",
        "sourceTitle": title,
        "sourceDescription": description,
        "sourceSha256": hashlib.sha256(args.grid.read_bytes()).hexdigest(),
        "catalogVersion": "GEBCO 2025 / GMT 6 arc-minute derivative",
        "doi": "https://doi.org/10.5285/37c52e96-24ea-67ce-e063-7086abc05f29",
        "license": "Public domain, source attribution required by GEBCO terms",
        "licenseUrl": "https://www.gebco.net/data-products/gridded-bathymetry/terms-of-use",
        "attribution": "GEBCO Compilation Group (2025); generalized by GMT; contours derived by AIS Vessel Tracker",
        "importedAt": datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z"),
        "gridSpacingDegrees": 0.1,
        "gaussianFilterFullWidthKm": 31.5,
        "bounds": [-180, -MERCATOR_LIMIT, 180, MERCATOR_LIMIT],
        "originalGridBounds": [-180, -90, 180, 90],
        "levelsMetres": list(LEVELS),
        "sourceLines": source_lines,
        "clippedLines": len(geometries),
        "minZoom": 0,
        "maxZoom": args.max_zoom,
        "tiles": tiles,
        "nonemptyTiles": nonempty,
        "bytes": byte_count,
        "largestTileBytes": largest_tile,
        "zooms": overview,
        "tileTemplate": "/bathymetry/global-tiles/{z}/{x}/{y}.pbf",
        "sourceLayer": "contours",
        "notForNavigation": True,
        "limitations": ["Generalized overview, not the original 15 arc-second grid", "Variable survey coverage; grid includes inferred/interpolated depths", "No derived contours above Web Mercator latitude limits", "Mediterranean detailed contours remain sourced separately from EMODnet"]
    }
    (OUT / "global-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps(manifest, indent=2), flush=True)


if __name__ == "__main__":
    main()

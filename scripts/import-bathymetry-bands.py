#!/usr/bin/env python3
"""Derive illustrative depth bands from the existing GEBCO/GMT 6-minute grid.
Requires the same isolated Python dependencies as import-global-bathymetry.py.
Bands are generalized overview data, not ECDIS charts or navigation soundings.
"""
import argparse
import datetime
import hashlib
import json
import math
import pathlib
import contourpy
import mapbox_vector_tile
import netCDF4
import numpy as np
from shapely.geometry import Polygon, box
from shapely import make_valid
from shapely.ops import transform
from shapely.strtree import STRtree

ROOT = pathlib.Path(__file__).resolve().parent.parent / 'frontend/public/bathymetry'
EXTENT = 4096
LIMIT = 85.0511287798066

def mercator(lon, lat, z=None):
    return (np.asarray(lon) + 180) / 360, (1 + np.log(np.tan(math.pi / 4 + np.deg2rad(lat) / 2)) / math.pi) / 2

def parts(geometry):
    if geometry.is_empty:
        return
    if geometry.geom_type == 'Polygon':
        yield geometry
    elif hasattr(geometry, 'geoms'):
        for child in geometry.geoms:
            yield from parts(child)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--grid', type=pathlib.Path, required=True)
    args = parser.parse_args()
    with netCDF4.Dataset(args.grid) as grid:
        if 'GEBCO' not in grid.title or '2025' not in grid.title:
            raise ValueError('Review provenance before using another grid release')
        generator = contourpy.contour_generator(x=np.asarray(grid.variables['lon'][:]), y=np.asarray(grid.variables['lat'][:]), z=np.asarray(grid.variables['z'][:], dtype=np.float64), fill_type='OuterOffset')
    world = box(-180, -LIMIT, 180, LIMIT)
    geometries, properties = [], []
    bands = [(0, 200), (200, 1000), (1000, 4000), (4000, 12000)]
    for shallow, deep in bands:
        points, offsets = generator.filled(-deep, -shallow)
        for polygon_points, polygon_offsets in zip(points, offsets):
            rings = [polygon_points[a:b] for a, b in zip(polygon_offsets[:-1], polygon_offsets[1:])]
            polygon = make_valid(Polygon(rings[0], rings[1:])).intersection(world)
            for part in parts(polygon):
                geometries.append(transform(mercator, part))
                properties.append({'minDepth': shallow, 'maxDepth': deep, 'generalized': True})
        print('Band', shallow, deep, len(geometries), flush=True)
    tree = STRtree(geometries)
    byte_count = 0
    for zoom in range(6):
        count = 2 ** zoom
        for x in range(count):
            folder = ROOT / 'depth-bands' / str(zoom) / str(x)
            folder.mkdir(parents=True, exist_ok=True)
            for y in range(count):
                west, east, south, north = x/count, (x+1)/count, 1-(y+1)/count, 1-y/count
                bounds = box(west, south, east, north)
                features = []
                for index in tree.query(bounds):
                    geom = geometries[index].intersection(bounds).simplify(0.5 / EXTENT / count, preserve_topology=True)
                    for part in parts(geom):
                        features.append({'geometry': part, 'properties': properties[index], 'id': int(index)})
                data = mapbox_vector_tile.encode({'name': 'bands', 'features': features}, default_options={'quantize_bounds': (west,south,east,north), 'extents': EXTENT})
                (folder / f'{y}.pbf').write_bytes(data)
                byte_count += len(data)
        print('Zoom', zoom, 'total bytes', byte_count, flush=True)
    manifest = {'source': 'GEBCO 2025 / GMT 6 arc-minute derivative', 'doi': 'https://doi.org/10.5285/37c52e96-24ea-67ce-e063-7086abc05f29', 'sourceSha256': hashlib.sha256(args.grid.read_bytes()).hexdigest(), 'importedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'bandsMetres': bands, 'bytes': byte_count, 'gridSpacingDegrees': 0.1, 'maxZoom': 5, 'displayMaxZoom': 7, 'notForNavigation': True, 'limitations': ['Generalized overview; coastal boundaries differ from the base map', 'No measured safe depths, berth depth or certified ENC content', 'Hidden at detailed coastal zoom levels']}
    (ROOT / 'depth-bands-manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
if __name__ == '__main__':
    main()

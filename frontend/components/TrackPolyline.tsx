'use client';

import { useEffect, useState } from 'react';
import { Polyline, useMap } from 'react-leaflet';
import type { VesselPosition } from '../../shared/types';

interface TrackPolylineProps {
  mmsi: string;
  days?: number;
}

export default function TrackPolyline({ mmsi, days = 30 }: TrackPolylineProps) {
  const [positions, setPositions] = useState<VesselPosition[]>([]);
  const map = useMap();

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/vessel/${mmsi}/track?days=${days}`);
        const data = await res.json() as VesselPosition[];
        if (!cancelled && data.length > 0) {
          setPositions(data);
          // Centra la mappa sul track
          const lats = data.map((p) => p.lat);
          const lons = data.map((p) => p.lon);
          map.fitBounds([
            [Math.min(...lats), Math.min(...lons)],
            [Math.max(...lats), Math.max(...lons)],
          ], { padding: [50, 50] });
        }
      } catch {
        // ignore
      }
    }

    load();
    return () => { cancelled = true; };
  }, [mmsi, days, map]);

  if (positions.length < 2) return null;

  const coords = positions.map((p) => [p.lat, p.lon] as [number, number]);

  return (
    <Polyline
      positions={coords}
      pathOptions={{
        color: '#3b82f6',
        weight: 2,
        opacity: 0.8,
      }}
    />
  );
}

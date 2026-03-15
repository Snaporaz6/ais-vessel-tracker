'use client';

import { useEffect, useState } from 'react';
import { Polyline, CircleMarker, Popup, useMap } from 'react-leaflet';
import type { VesselPosition } from '../../shared/types';

interface TrackPolylineProps {
  mmsi: string;
  days?: number;
}

/** Bucket di velocità per la colorazione della traccia */
type SpeedBucket = 'anchored' | 'slow' | 'normal' | 'fast' | 'veryfast';

function getSpeedBucket(speed: number): SpeedBucket {
  if (speed < 1) return 'anchored';
  if (speed < 8) return 'slow';
  if (speed < 15) return 'normal';
  if (speed < 22) return 'fast';
  return 'veryfast';
}

/** Colori per bucket di velocità — usati anche nella legenda in Map.tsx */
export const SPEED_COLORS: Record<SpeedBucket, string> = {
  anchored: '#64748b', // slate   — ferma/ancorata
  slow:     '#22c55e', // verde   — lenta (1–8 kn)
  normal:   '#f59e0b', // ambra   — transito normale (8–15 kn)
  fast:     '#ef4444', // rosso   — veloce (15–22 kn)
  veryfast: '#a855f7', // viola   — molto veloce (> 22 kn)
};

export const SPEED_LABELS: Record<SpeedBucket, string> = {
  anchored: '< 1 kn · Ferma',
  slow:     '1–8 kn · Lenta',
  normal:   '8–15 kn · Normale',
  fast:     '15–22 kn · Veloce',
  veryfast: '> 22 kn · Molto veloce',
};

interface TrackSegment {
  coords: [number, number][];
  color: string;
}

/**
 * Divide la traccia in segmenti colorati per velocità.
 * Ogni segmento condivide il primo/ultimo punto col segmento adiacente
 * per evitare gap visivi nella linea.
 */
function buildColoredSegments(positions: VesselPosition[]): TrackSegment[] {
  if (positions.length < 2) return [];

  const segments: TrackSegment[] = [];
  let currentBucket = getSpeedBucket(positions[0]!.speed);
  let currentCoords: [number, number][] = [[positions[0]!.lat, positions[0]!.lon]];

  for (let i = 1; i < positions.length; i++) {
    const pos = positions[i]!;
    const newBucket = getSpeedBucket(pos.speed);

    currentCoords.push([pos.lat, pos.lon]);

    if (newBucket !== currentBucket) {
      // Chiudi segmento corrente (include il punto di transizione)
      if (currentCoords.length >= 2) {
        segments.push({
          coords: [...currentCoords],
          color: SPEED_COLORS[currentBucket],
        });
      }
      // Nuovo segmento comincia dall'ultimo punto (overlap per continuità)
      currentBucket = newBucket;
      currentCoords = [[pos.lat, pos.lon]];
    }
  }

  // Ultimo segmento
  if (currentCoords.length >= 2) {
    segments.push({ coords: currentCoords, color: SPEED_COLORS[currentBucket] });
  }

  return segments;
}

export default function TrackPolyline({ mmsi, days = 30 }: TrackPolylineProps) {
  const [positions, setPositions] = useState<VesselPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const map = useMap();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPositions([]);

    async function load() {
      try {
        const res = await fetch(`/api/vessel/${mmsi}/track?days=${days}`);
        const data = (await res.json()) as VesselPosition[];
        if (!cancelled && Array.isArray(data) && data.length > 0) {
          setPositions(data);
          // Centra la mappa sull'intera traccia
          const lats = data.map((p) => p.lat);
          const lons = data.map((p) => p.lon);
          map.fitBounds(
            [
              [Math.min(...lats), Math.min(...lons)],
              [Math.max(...lats), Math.max(...lons)],
            ],
            { padding: [50, 50] }
          );
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [mmsi, days, map]);

  if (loading || positions.length < 2) return null;

  const segments = buildColoredSegments(positions);
  const firstPos = positions[0]!;
  const lastPos = positions[positions.length - 1]!;

  return (
    <>
      {/* Segmenti colorati per velocità */}
      {segments.map((seg, i) => (
        <Polyline
          key={i}
          positions={seg.coords}
          pathOptions={{ color: seg.color, weight: 2.5, opacity: 0.85 }}
        />
      ))}

      {/* Marker inizio traccia — verde */}
      <CircleMarker
        center={[firstPos.lat, firstPos.lon]}
        radius={5}
        pathOptions={{
          color: '#fff',
          fillColor: '#22c55e',
          fillOpacity: 1,
          weight: 1.5,
        }}
      >
        <Popup>
          <div style={{ fontSize: 12, minWidth: 140 }}>
            <strong>Inizio traccia</strong>
            <br />
            {new Date(firstPos.timestamp).toLocaleString()}
            <br />
            Velocità: {firstPos.speed} kn
          </div>
        </Popup>
      </CircleMarker>

      {/* Marker ultima posizione — ambra */}
      <CircleMarker
        center={[lastPos.lat, lastPos.lon]}
        radius={6}
        pathOptions={{
          color: '#fff',
          fillColor: '#f59e0b',
          fillOpacity: 1,
          weight: 1.5,
        }}
      >
        <Popup>
          <div style={{ fontSize: 12, minWidth: 140 }}>
            <strong>Ultima posizione</strong>
            <br />
            {new Date(lastPos.timestamp).toLocaleString()}
            <br />
            Velocità: {lastPos.speed} kn · Rotta: {lastPos.course}°
            <br />
            Stato: {lastPos.nav_status}
          </div>
        </Popup>
      </CircleMarker>
    </>
  );
}

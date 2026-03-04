'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import type { LiveMapVessel } from '../../shared/types';

/** Icona nave colorata per tipo */
function vesselIcon(type: string, isSanctioned: boolean): L.DivIcon {
  const colors: Record<string, string> = {
    cargo: '#22c55e',
    tanker: '#f59e0b',
    passenger: '#3b82f6',
    fishing: '#06b6d4',
    tug: '#8b5cf6',
    pleasure: '#ec4899',
    military: '#6b7280',
    other: '#9ca3af',
  };
  const color = isSanctioned ? '#ef4444' : (colors[type] ?? '#9ca3af');

  return L.divIcon({
    className: '',
    html: `<div style="
      width: 10px; height: 10px;
      background: ${color};
      border: 1.5px solid #fff;
      border-radius: 50%;
      box-shadow: 0 0 4px ${color};
    "></div>`,
    iconSize: [10, 10],
    iconAnchor: [5, 5],
  });
}

interface MapEventsProps {
  onBoundsChange: (bbox: string) => void;
}

function MapEvents({ onBoundsChange }: MapEventsProps) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useMapEvents({
    moveend: (e) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        const bounds = e.target.getBounds();
        const bbox = `${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}`;
        onBoundsChange(bbox);
      }, 300);
    },
  });

  return null;
}

interface MapComponentProps {
  onVesselClick: (mmsi: string) => void;
}

export default function MapComponent({ onVesselClick }: MapComponentProps) {
  const [vessels, setVessels] = useState<LiveMapVessel[]>([]);
  const [bbox, setBbox] = useState('30,-6,46,36.5'); // Mediterraneo di default

  const fetchVessels = useCallback(async (b: string) => {
    try {
      const res = await fetch(`/api/map/live?bbox=${b}`);
      const data = await res.json() as LiveMapVessel[];
      setVessels(Array.isArray(data) ? data : []);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchVessels(bbox);
    const interval = setInterval(() => fetchVessels(bbox), 30_000);
    return () => clearInterval(interval);
  }, [bbox, fetchVessels]);

  const handleBoundsChange = useCallback((newBbox: string) => {
    setBbox(newBbox);
  }, []);

  return (
    <MapContainer
      center={[38, 15]}
      zoom={6}
      style={{ width: '100%', height: '100%' }}
      zoomControl={true}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />
      <MapEvents onBoundsChange={handleBoundsChange} />
      {vessels.map((v) => (
        <Marker
          key={v.mmsi}
          position={[v.lat, v.lon]}
          icon={vesselIcon(v.ship_type, v.is_sanctioned)}
          eventHandlers={{
            click: () => onVesselClick(v.mmsi),
          }}
        >
          <Popup>
            <div style={{ color: '#000', fontSize: 12 }}>
              <strong>{v.name}</strong><br />
              {v.mmsi} | {v.ship_type}<br />
              {v.speed} kn | {v.course}°
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}

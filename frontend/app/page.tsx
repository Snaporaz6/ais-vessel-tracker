'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import SearchBar from '../components/SearchBar';
import VesselDrawer from '../components/VesselDrawer';
import type { Vessel } from '../../shared/types';

// Leaflet non supporta SSR — dynamic import
const Map = dynamic(() => import('../components/Map'), { ssr: false });

export default function HomePage() {
  const [selectedMmsi, setSelectedMmsi] = useState<string | null>(null);
  const [trackMmsi, setTrackMmsi] = useState<string | null>(null);

  const handleVesselSelect = (vessel: Vessel) => {
    setSelectedMmsi(vessel.mmsi);
  };

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <Map
        onVesselClick={(mmsi) => setSelectedMmsi(mmsi)}
        trackMmsi={trackMmsi}
      />

      <SearchBar onSelect={handleVesselSelect} />

      {/* Vessel count badge */}
      <div style={{
        position: 'absolute',
        bottom: 16,
        left: 16,
        zIndex: 1000,
        background: 'var(--bg-card)',
        padding: '6px 12px',
        borderRadius: 6,
        fontSize: 12,
        color: 'var(--text-secondary)',
        border: '1px solid var(--border)',
      }}>
        AIS Vessel Tracker — Mediterranean
      </div>

      {selectedMmsi && (
        <VesselDrawer
          mmsi={selectedMmsi}
          onClose={() => setSelectedMmsi(null)}
          onShowTrack={(mmsi) => {
            setTrackMmsi(mmsi);
          }}
        />
      )}
    </div>
  );
}

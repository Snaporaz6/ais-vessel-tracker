'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import SearchBar from '../components/SearchBar';
import VesselDrawer from '../components/VesselDrawer';
import VesselFilter from '../components/VesselFilter';
import type { Vessel, ShipType } from '../../shared/types';

// MapLibre GL non supporta SSR — dynamic import
const Map = dynamic(() => import('../components/Map'), { ssr: false });

const ALL_SHIP_TYPES = new Set<ShipType>([
  'cargo', 'tanker', 'passenger', 'fishing', 'tug', 'pleasure', 'military', 'other',
]);

export default function HomePage() {
  const [selectedMmsi, setSelectedMmsi] = useState<string | null>(null);
  const [trackMmsi, setTrackMmsi] = useState<string | null>(null);
  const [visibleTypes, setVisibleTypes] = useState<Set<ShipType>>(new Set(ALL_SHIP_TYPES));
  const [typeCounts, setTypeCounts] = useState<Record<string, number>>({});
  const [isGlobe, setIsGlobe] = useState(false);

  const handleVesselSelect = (vessel: Vessel) => {
    setSelectedMmsi(vessel.mmsi);
  };

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <Map
        onVesselClick={(mmsi) => setSelectedMmsi(mmsi)}
        trackMmsi={trackMmsi}
        visibleTypes={visibleTypes}
        onTypeCounts={setTypeCounts}
        isGlobe={isGlobe}
      />

      <SearchBar onSelect={handleVesselSelect} />

      <VesselFilter
        visibleTypes={visibleTypes}
        onFilterChange={setVisibleTypes}
        typeCounts={typeCounts}
      />

      {/* Toggle Globo / Mappa piatta */}
      <button
        onClick={() => setIsGlobe((prev) => !prev)}
        style={globeToggleStyle}
        title={isGlobe ? 'Passa a mappa piatta' : 'Passa a globo 3D'}
        aria-label={isGlobe ? 'Passa a mappa piatta' : 'Passa a globo 3D'}
      >
        <span style={{ fontSize: 18 }}>{isGlobe ? '🗺️' : '🌍'}</span>
        <span style={{ fontSize: 10, color: '#9ca3af' }}>{isGlobe ? '2D' : '3D'}</span>
      </button>

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

const globeToggleStyle: React.CSSProperties = {
  position: 'absolute',
  top: 130,
  left: 16,
  zIndex: 1000,
  width: 38,
  height: 50,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 1,
  background: 'rgba(17, 24, 39, 0.92)',
  backdropFilter: 'blur(4px)',
  border: '1px solid #374151',
  borderRadius: 8,
  cursor: 'pointer',
  padding: 0,
};

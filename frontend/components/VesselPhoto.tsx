'use client';

import { useState } from 'react';

interface VesselPhotoProps {
  mmsi: string;
  imo: string | null;
  vesselName: string;
  /** Altezza del contenitore immagine in px */
  height?: number;
}

/** Costruisce URL foto nave da MarineTraffic, preferendo IMO se disponibile */
function getPhotoUrl(mmsi: string, imo: string | null): string {
  if (imo) {
    return `https://photos.marinetraffic.com/ais/showphoto.aspx?imo=${imo}&size=thumb300`;
  }
  return `https://photos.marinetraffic.com/ais/showphoto.aspx?mmsi=${mmsi}&size=thumb300`;
}

/**
 * Componente client per la foto nave con fallback elegante.
 * Usa MarineTraffic come sorgente, con placeholder se la foto non è disponibile.
 */
export default function VesselPhoto({ mmsi, imo, vesselName, height = 160 }: VesselPhotoProps) {
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return (
      <div style={{
        height: Math.min(height, 80),
        borderRadius: 8,
        background: 'var(--bg-card)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        color: 'var(--text-secondary)',
        fontSize: 12,
        border: '1px solid var(--border)',
      }}>
        <span style={{ fontSize: 20, opacity: 0.5 }}>🚢</span>
        No photo available
      </div>
    );
  }

  return (
    <div style={{
      borderRadius: 8,
      overflow: 'hidden',
      background: '#1a1a2e',
      border: '1px solid var(--border)',
    }}>
      <img
        src={getPhotoUrl(mmsi, imo)}
        alt={vesselName}
        style={{
          width: '100%',
          height,
          objectFit: 'cover',
          display: 'block',
        }}
        onError={() => setHasError(true)}
        referrerPolicy="no-referrer"
      />
    </div>
  );
}

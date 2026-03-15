'use client';

import { useState } from 'react';

interface VesselPhotoProps {
  mmsi: string;
  imo: string | null;
  name: string;
}

/** Costruisce URL foto nave da MarineTraffic, con fallback per IMO/MMSI */
function getVesselPhotoUrl(mmsi: string, imo: string | null): string {
  if (imo) {
    return `https://photos.marinetraffic.com/ais/showphoto.aspx?imo=${imo}&size=thumb300`;
  }
  return `https://photos.marinetraffic.com/ais/showphoto.aspx?mmsi=${mmsi}&size=thumb300`;
}

/**
 * Componente client per foto nave con gestione errore di caricamento.
 * Necessario come componente separato perche' le pagine SSR sono Server Components
 * e non possono usare useState per gestire il fallback foto.
 */
export default function VesselPhoto({ mmsi, imo, name }: VesselPhotoProps) {
  const [error, setError] = useState(false);

  if (error) {
    return (
      <div style={{
        marginBottom: 16,
        borderRadius: 8,
        background: '#1a1a2e',
        height: 80,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-secondary)',
        fontSize: 12,
      }}>
        No photo available
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 16, borderRadius: 8, overflow: 'hidden', background: '#1a1a2e' }}>
      <img
        src={getVesselPhotoUrl(mmsi, imo)}
        alt={name}
        style={{ width: '100%', height: 200, objectFit: 'cover', display: 'block' }}
        onError={() => setError(true)}
        referrerPolicy="no-referrer"
      />
    </div>
  );
}

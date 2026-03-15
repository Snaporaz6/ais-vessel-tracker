'use client';

import { useState } from 'react';

interface VesselPhotoProps {
  mmsi: string;
  imo: string | null;
  name: string;
}

/**
 * Displays a vessel photo placeholder.
 * Uses ship silhouette as fallback since no external photo API is configured for MVP.
 */
export default function VesselPhoto({ mmsi, imo, name }: VesselPhotoProps) {
  const [error, setError] = useState(false);

  // Try MarineTraffic-style photo URL via IMO if available
  const photoUrl = imo && !error
    ? `https://photos.marinetraffic.com/ais/showphoto.aspx?mmsi=${mmsi}&size=thumb300`
    : null;

  if (!photoUrl || error) {
    return (
      <div style={placeholderStyle}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="1.5">
          <path d="M3 17l4-4 4 4 4-6 6 6" />
          <rect x="2" y="4" width="20" height="16" rx="2" />
        </svg>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>
          No photo available for {name}
        </span>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <img
        src={photoUrl}
        alt={`Photo of vessel ${name}`}
        style={{ width: '100%', maxWidth: 400, borderRadius: 8, border: '1px solid var(--border)' }}
        onError={() => setError(true)}
      />
    </div>
  );
}

const placeholderStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: 120,
  background: 'var(--bg-card)',
  borderRadius: 8,
  border: '1px solid var(--border)',
  marginBottom: 16,
};

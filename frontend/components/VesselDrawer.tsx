'use client';

import { useEffect, useState } from 'react';
import type { Vessel, VesselPosition, AnomalyEvent, SanctionRecord } from '../../shared/types';
import AnomalyBadge from './AnomalyBadge';
import SanctionBadge from './SanctionBadge';

interface VesselDetail extends Vessel {
  last_position: VesselPosition | null;
  sanctions: SanctionRecord[];
  anomalies: AnomalyEvent[];
}

interface VesselDrawerProps {
  mmsi: string;
  onClose: () => void;
  onShowTrack: (mmsi: string) => void;
}

export default function VesselDrawer({ mmsi, onClose, onShowTrack }: VesselDrawerProps) {
  const [vessel, setVessel] = useState<VesselDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetch(`/api/vessel/${mmsi}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setVessel(data as VesselDetail);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [mmsi]);

  const drawerStyle: React.CSSProperties = {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 380,
    background: 'var(--bg-secondary)',
    borderLeft: '1px solid var(--border)',
    zIndex: 1001,
    overflowY: 'auto',
    padding: 20,
  };

  if (loading) {
    return (
      <div style={drawerStyle}>
        <button onClick={onClose} style={closeButtonStyle}>X</button>
        <p style={{ color: 'var(--text-secondary)', marginTop: 40 }}>Loading...</p>
      </div>
    );
  }

  if (!vessel) {
    return (
      <div style={drawerStyle}>
        <button onClick={onClose} style={closeButtonStyle}>X</button>
        <p style={{ color: 'var(--text-secondary)', marginTop: 40 }}>Vessel not found</p>
      </div>
    );
  }

  return (
    <div style={drawerStyle}>
      <button onClick={onClose} style={closeButtonStyle}>X</button>

      <h2 style={{ marginTop: 8, fontSize: 18 }}>{vessel.name}</h2>
      <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 12 }}>
        MMSI: {vessel.mmsi} | IMO: {vessel.imo ?? 'N/A'} | Flag: {vessel.flag ?? 'N/A'}
      </p>

      {/* Badges */}
      <div style={{ marginBottom: 12 }}>
        {vessel.sanctions.map((s, i) => (
          <SanctionBadge key={i} source={s.source} />
        ))}
        {vessel.anomalies.slice(0, 5).map((a, i) => (
          <AnomalyBadge key={i} type={a.type} />
        ))}
      </div>

      {/* Details */}
      <div style={{ fontSize: 13, lineHeight: 1.8 }}>
        <div><strong>Type:</strong> {vessel.ship_type}</div>
        <div><strong>Size:</strong> {vessel.length ?? '?'}m x {vessel.width ?? '?'}m</div>
        {vessel.last_position && (
          <>
            <div><strong>Position:</strong> {vessel.last_position.lat.toFixed(4)}, {vessel.last_position.lon.toFixed(4)}</div>
            <div><strong>Speed:</strong> {vessel.last_position.speed} kn</div>
            <div><strong>Course:</strong> {vessel.last_position.course}°</div>
            <div><strong>Status:</strong> {vessel.last_position.nav_status}</div>
            <div><strong>Last update:</strong> {new Date(vessel.last_position.timestamp).toLocaleString()}</div>
          </>
        )}
      </div>

      {/* Actions */}
      <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
        <button
          onClick={() => onShowTrack(mmsi)}
          style={actionButtonStyle}
        >
          Show Track
        </button>
        <a
          href={`/vessel/${mmsi}`}
          style={{ ...actionButtonStyle, textAlign: 'center' }}
        >
          Full Details
        </a>
      </div>

      {/* Anomalies list */}
      {vessel.anomalies.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 14, marginBottom: 8 }}>Recent Anomalies</h3>
          {vessel.anomalies.slice(0, 10).map((a, i) => (
            <div key={i} style={{ fontSize: 12, padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
              <AnomalyBadge type={a.type} />
              <span style={{ color: 'var(--text-secondary)', marginLeft: 4 }}>
                {new Date(a.detected_at).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const closeButtonStyle: React.CSSProperties = {
  position: 'absolute',
  top: 12,
  right: 12,
  background: 'transparent',
  border: 'none',
  color: 'var(--text-secondary)',
  fontSize: 18,
  cursor: 'pointer',
};

const actionButtonStyle: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 6,
  border: '1px solid var(--border)',
  background: 'var(--bg-card)',
  color: 'var(--text-primary)',
  cursor: 'pointer',
  fontSize: 13,
  display: 'inline-block',
};

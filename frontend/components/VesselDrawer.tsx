'use client';

import { useEffect, useState } from 'react';
import type { Vessel, VesselPosition, AnomalyEvent, SanctionRecord, PortCall } from '../../shared/types';
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

/** Costruisce URL foto nave da più fonti, con fallback */
function getVesselPhotoUrl(mmsi: string, imo: string | null): string {
  // Usa IMO se disponibile (più affidabile per le foto)
  if (imo) {
    return `https://photos.marinetraffic.com/ais/showphoto.aspx?imo=${imo}&size=thumb300`;
  }
  return `https://photos.marinetraffic.com/ais/showphoto.aspx?mmsi=${mmsi}&size=thumb300`;
}

/** Formatta ETA ISO in stringa leggibile */
function formatEta(eta: string | null): string {
  if (!eta) return 'N/A';
  const d = new Date(eta);
  if (isNaN(d.getTime())) return 'N/A';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Formatta durata in ore in stringa leggibile */
function formatDuration(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}min`;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  const days = Math.floor(hours / 24);
  const h = Math.round(hours % 24);
  return `${days}d ${h}h`;
}

export default function VesselDrawer({ mmsi, onClose, onShowTrack }: VesselDrawerProps) {
  const [vessel, setVessel] = useState<VesselDetail | null>(null);
  const [portCalls, setPortCalls] = useState<PortCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [photoError, setPhotoError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPhotoError(false);
    setPortCalls([]);

    // Fetch vessel details
    fetch(`/api/vessel/${mmsi}`)
      .then((res) => {
        if (!res.ok) return null;
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setVessel(data as VesselDetail | null);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    // Fetch port calls in parallel
    fetch(`/api/vessel/${mmsi}/portcalls`)
      .then((res) => {
        if (!res.ok) return [];
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setPortCalls(Array.isArray(data) ? data as PortCall[] : []);
      })
      .catch(() => {});

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

      {/* Foto nave */}
      {!photoError ? (
        <div style={{ marginBottom: 12, borderRadius: 8, overflow: 'hidden', background: '#1a1a2e' }}>
          <img
            src={getVesselPhotoUrl(vessel.mmsi, vessel.imo)}
            alt={vessel.name}
            style={{ width: '100%', height: 160, objectFit: 'cover', display: 'block' }}
            onError={() => setPhotoError(true)}
            referrerPolicy="no-referrer"
          />
        </div>
      ) : (
        <div style={{
          marginBottom: 12,
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
      )}

      {/* Badges */}
      <div style={{ marginBottom: 12 }}>
        {(vessel.sanctions ?? []).map((s, i) => (
          <SanctionBadge key={i} source={s.source} />
        ))}
        {(vessel.anomalies ?? []).slice(0, 5).map((a, i) => (
          <AnomalyBadge key={i} type={a.type} />
        ))}
      </div>

      {/* Voyage info */}
      <div style={{
        marginBottom: 12,
        padding: '10px 12px',
        background: 'var(--bg-card)',
        borderRadius: 8,
        border: '1px solid var(--border)',
      }}>
        <div style={{ fontSize: 13, lineHeight: 1.8 }}>
          <div>
            <strong>Destination:</strong>{' '}
            <span style={{ color: vessel.destination ? '#3b82f6' : 'var(--text-secondary)' }}>
              {vessel.destination ?? 'N/A'}
            </span>
          </div>
          <div>
            <strong>ETA:</strong>{' '}
            <span style={{ color: vessel.eta ? '#22c55e' : 'var(--text-secondary)' }}>
              {formatEta(vessel.eta)}
            </span>
          </div>
        </div>
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

      {/* Port Call History */}
      {portCalls.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 14, marginBottom: 8 }}>Port Call History (last 90 days)</h3>
          {portCalls.slice(0, 15).map((pc, i) => (
            <div key={i} style={{
              fontSize: 12,
              padding: '8px 0',
              borderBottom: '1px solid var(--border)',
              lineHeight: 1.6,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600 }}>{pc.port_name}</span>
                <span style={{
                  background: pc.departed_at ? 'var(--bg-card)' : '#22c55e22',
                  color: pc.departed_at ? 'var(--text-secondary)' : '#22c55e',
                  padding: '1px 6px',
                  borderRadius: 4,
                  fontSize: 10,
                }}>
                  {pc.departed_at ? formatDuration(pc.duration_hours) : 'In port'}
                </span>
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
                {new Date(pc.arrived_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                {pc.departed_at && (
                  <> — {new Date(pc.departed_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Anomalies list */}
      {(vessel.anomalies ?? []).length > 0 && (
        <div style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 14, marginBottom: 8 }}>Recent Anomalies</h3>
          {(vessel.anomalies ?? []).slice(0, 10).map((a, i) => (
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

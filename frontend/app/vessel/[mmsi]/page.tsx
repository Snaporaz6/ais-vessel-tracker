import type { Metadata } from 'next';
import AnomalyBadge from '../../../components/AnomalyBadge';
import SanctionBadge from '../../../components/SanctionBadge';
import VesselPhoto from '../../../components/VesselPhoto';
import type { Vessel, VesselPosition, AnomalyEvent, SanctionRecord, PortCall, ShipType } from '../../../../shared/types';

/* ─────────────────── Types ─────────────────── */

interface VesselDetail extends Vessel {
  last_position: VesselPosition | null;
  sanctions: SanctionRecord[];
  anomalies: AnomalyEvent[];
}

interface PageProps {
  params: Promise<{ mmsi: string }>;
}

/* ─────────────────── Data fetching SSR ─────────────────── */

async function fetchVessel(mmsi: string): Promise<VesselDetail | null> {
  const base = process.env.API_BASE_URL || 'http://localhost:3001';
  try {
    const res = await fetch(`${base}/api/vessel/${mmsi}`, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    return res.json() as Promise<VesselDetail>;
  } catch {
    return null;
  }
}

async function fetchPortCalls(mmsi: string): Promise<PortCall[]> {
  const base = process.env.API_BASE_URL || 'http://localhost:3001';
  try {
    const res = await fetch(`${base}/api/vessel/${mmsi}/portcalls`, { next: { revalidate: 300 } });
    if (!res.ok) return [];
    return res.json() as Promise<PortCall[]>;
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { mmsi } = await params;
  const vessel = await fetchVessel(mmsi);
  if (!vessel) return { title: 'Vessel Not Found — AIS Vessel Tracker' };

  const desc = [
    `Track ${vessel.name}`,
    `MMSI: ${vessel.mmsi}`,
    vessel.imo ? `IMO: ${vessel.imo}` : null,
    `${vessel.ship_type} vessel`,
    vessel.flag ? `flag ${vessel.flag}` : null,
    vessel.destination ? `bound for ${vessel.destination}` : null,
  ].filter(Boolean).join(' — ');

  return {
    title: `${vessel.name} (${vessel.mmsi}) — AIS Vessel Tracker`,
    description: desc,
  };
}

/* ─────────────────── Helpers ─────────────────── */

const VESSEL_COLORS: Record<string, string> = {
  cargo: '#22c55e', tanker: '#f59e0b', passenger: '#3b82f6',
  fishing: '#06b6d4', tug: '#8b5cf6', pleasure: '#ec4899',
  military: '#6b7280', other: '#9ca3af',
};

/** Formatta ETA ISO in stringa leggibile */
function formatEta(eta: string | null): string {
  if (!eta) return 'N/A';
  const d = new Date(eta);
  if (isNaN(d.getTime())) return 'N/A';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Formatta durata ore */
function formatDuration(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}min`;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  const days = Math.floor(hours / 24);
  const h = Math.round(hours % 24);
  return `${days}d ${h}h`;
}

/** Genera URL della pagina porto dal nome (coordinate) */
function portUrl(portName: string): string {
  return `/port/${encodeURIComponent(portName)}`;
}

/* ─────────────────── Page ─────────────────── */

export default async function VesselPage({ params }: PageProps) {
  const { mmsi } = await params;
  const [vessel, portCalls] = await Promise.all([
    fetchVessel(mmsi),
    fetchPortCalls(mmsi),
  ]);

  if (!vessel) {
    return (
      <div style={containerStyle}>
        <a href="/" style={backLinkStyle}>&larr; Back to map</a>
        <h1 style={{ fontSize: 24, marginTop: 16 }}>Vessel Not Found</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 8 }}>
          No vessel found with MMSI {mmsi}
        </p>
      </div>
    );
  }

  const typeColor = VESSEL_COLORS[vessel.ship_type] ?? '#9ca3af';

  return (
    <div style={containerStyle}>
      <a href="/" style={backLinkStyle}>&larr; Back to map</a>

      {/* Header: nome + badges */}
      <div style={{ marginTop: 16, marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 26, fontWeight: 700 }}>{vessel.name}</h1>
          <span style={{
            background: typeColor + '22',
            color: typeColor,
            padding: '2px 10px',
            borderRadius: 12,
            fontSize: 12,
            fontWeight: 600,
            textTransform: 'uppercase',
          }}>
            {vessel.ship_type}
          </span>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
          MMSI: {vessel.mmsi} | IMO: {vessel.imo ?? 'N/A'} | Flag: {vessel.flag ?? 'N/A'}
        </p>
      </div>

      {/* Badges */}
      {((vessel.sanctions ?? []).length > 0 || (vessel.anomalies ?? []).length > 0) && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
          {(vessel.sanctions ?? []).map((s, i) => (
            <SanctionBadge key={i} source={s.source} />
          ))}
          {(vessel.anomalies ?? []).slice(0, 5).map((a, i) => (
            <AnomalyBadge key={i} type={a.type} />
          ))}
        </div>
      )}

      {/* Layout a due colonne: foto + voyage | info griglia */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
        gap: 16,
        marginBottom: 24,
      }}>
        {/* Colonna sinistra: foto + voyage */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <VesselPhoto
            mmsi={vessel.mmsi}
            imo={vessel.imo}
            vesselName={vessel.name}
            height={180}
          />

          {/* Voyage info card */}
          <div style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '14px 18px',
          }}>
            <h3 style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Current Voyage
            </h3>
            <div style={{ fontSize: 14, lineHeight: 2 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Destination</span>
                <span style={{ color: vessel.destination ? '#3b82f6' : 'var(--text-secondary)', fontWeight: vessel.destination ? 600 : 400 }}>
                  {vessel.destination ?? 'Not reported'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>ETA</span>
                <span style={{ color: vessel.eta ? '#22c55e' : 'var(--text-secondary)', fontWeight: vessel.eta ? 600 : 400 }}>
                  {formatEta(vessel.eta)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Colonna destra: dettagli */}
        <div style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: '14px 18px',
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
        }}>
          <h3 style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Vessel Details
          </h3>
          <DetailRow label="Type" value={vessel.ship_type} color={typeColor} />
          <DetailRow label="Flag" value={vessel.flag ?? 'N/A'} />
          <DetailRow label="Size" value={`${vessel.length ?? '?'}m × ${vessel.width ?? '?'}m`} />
          <DetailRow label="Max Speed" value={vessel.max_speed ? `${vessel.max_speed} kn` : 'N/A'} />
          {vessel.last_position && (
            <>
              <div style={{ borderTop: '1px solid var(--border)', marginTop: 6, paddingTop: 6 }} />
              <DetailRow label="Position" value={`${vessel.last_position.lat.toFixed(4)}°, ${vessel.last_position.lon.toFixed(4)}°`} />
              <DetailRow label="Speed" value={`${vessel.last_position.speed} kn`} />
              <DetailRow label="Course" value={`${vessel.last_position.course}°`} />
              <DetailRow label="Status" value={vessel.last_position.nav_status.replace(/_/g, ' ')} />
              <DetailRow
                label="Updated"
                value={new Date(vessel.last_position.timestamp).toLocaleString()}
                secondary
              />
            </>
          )}
        </div>
      </div>

      {/* Port Calls con link cliccabili */}
      {portCalls.length > 0 && (
        <section style={sectionStyle}>
          <h2 style={sectionTitleStyle}>⚓ Port Calls (last 90 days)</h2>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Location</th>
                <th style={thStyle}>Arrived</th>
                <th style={thStyle}>Departed</th>
                <th style={thStyle}>Duration</th>
              </tr>
            </thead>
            <tbody>
              {portCalls.map((pc, i) => (
                <tr key={i}>
                  <td style={tdStyle}>
                    <a href={portUrl(pc.port_name)} style={{ color: 'var(--accent)', fontWeight: 500 }}>
                      {pc.port_name}
                    </a>
                  </td>
                  <td style={tdStyle}>
                    {new Date(pc.arrived_at).toLocaleDateString(undefined, {
                      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                    })}
                  </td>
                  <td style={tdStyle}>
                    {pc.departed_at
                      ? new Date(pc.departed_at).toLocaleDateString(undefined, {
                          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                        })
                      : <span style={{ color: 'var(--success)', fontWeight: 600 }}>Still in port</span>}
                  </td>
                  <td style={tdStyle}>
                    <span style={{
                      background: 'var(--bg-card)',
                      padding: '2px 8px',
                      borderRadius: 4,
                      fontSize: 11,
                    }}>
                      {formatDuration(pc.duration_hours)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Anomalies */}
      {(vessel.anomalies ?? []).length > 0 && (
        <section style={sectionStyle}>
          <h2 style={sectionTitleStyle}>⚠️ Anomaly Events</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(vessel.anomalies ?? []).map((a, i) => (
              <div key={i} style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <AnomalyBadge type={a.type} />
                  <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                    {new Date(a.detected_at).toLocaleString()}
                  </span>
                </div>
                {a.details && Object.keys(a.details).length > 0 && (
                  <pre style={{
                    fontSize: 10,
                    color: 'var(--text-secondary)',
                    margin: 0,
                    maxWidth: 300,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>
                    {JSON.stringify(a.details)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Sanctions */}
      {(vessel.sanctions ?? []).length > 0 && (
        <section style={sectionStyle}>
          <h2 style={sectionTitleStyle}>🚨 Sanctions</h2>
          {(vessel.sanctions ?? []).map((s, i) => (
            <div key={i} style={{
              background: '#ef444411',
              border: '1px solid #ef444444',
              borderRadius: 8,
              padding: '12px 16px',
              marginBottom: 8,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <SanctionBadge source={s.source} />
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  Listed: {new Date(s.listed_at).toLocaleDateString()}
                </span>
              </div>
              <p style={{ fontSize: 13, marginTop: 6, color: 'var(--text-secondary)' }}>
                {s.name}
              </p>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

/* ─────────────────── Sub-components ─────────────────── */

function DetailRow({
  label,
  value,
  color,
  secondary,
}: {
  label: string;
  value: string;
  color?: string;
  secondary?: boolean;
}) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      fontSize: 13,
      lineHeight: 2,
    }}>
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{
        color: color ?? (secondary ? 'var(--text-secondary)' : 'var(--text-primary)'),
        fontWeight: color ? 600 : 400,
        textTransform: color ? 'capitalize' : undefined,
      }}>
        {value}
      </span>
    </div>
  );
}

/* ─────────────────── Styles ─────────────────── */

const containerStyle: React.CSSProperties = {
  maxWidth: 960,
  margin: '0 auto',
  padding: '24px 16px 64px',
};

const backLinkStyle: React.CSSProperties = {
  fontSize: 13,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  color: 'var(--text-secondary)',
};

const sectionStyle: React.CSSProperties = {
  marginTop: 28,
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 600,
  marginBottom: 14,
  paddingBottom: 8,
  borderBottom: '1px solid var(--border)',
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 13,
};

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 12px',
  borderBottom: '2px solid var(--border)',
  color: 'var(--text-secondary)',
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const tdStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderBottom: '1px solid var(--border)',
  verticalAlign: 'middle',
};

import type { Metadata } from 'next';
import type { PortInfo, PortVisit, ShipType } from '../../../../shared/types';

/* ─────────────────── Data fetching SSR ─────────────────── */

interface PageProps {
  params: Promise<{ name: string }>;
}

async function fetchPort(name: string): Promise<PortInfo | null> {
  const base = process.env.API_BASE_URL || 'http://localhost:3001';
  try {
    const res = await fetch(
      `${base}/api/port/${encodeURIComponent(name)}`,
      { next: { revalidate: 300 } }
    );
    if (!res.ok) return null;
    return res.json() as Promise<PortInfo>;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { name } = await params;
  const portName = decodeURIComponent(name);
  const port = await fetchPort(portName);

  if (!port) {
    return { title: `Port ${portName} — AIS Vessel Tracker` };
  }

  return {
    title: `Port ${portName} — ${port.total_vessels_seen} vessels tracked — AIS Vessel Tracker`,
    description: `Real-time vessel traffic at ${portName}. ${port.currently_in_port} vessels currently in port, ${port.total_vessels_seen} total tracked in the last 90 days. Average stay: ${port.avg_stay_hours}h.`,
  };
}

/* ─────────────────── Helper functions ─────────────────── */

/** Colori per tipo nave, coerenti con Map.tsx */
const VESSEL_COLORS: Record<string, string> = {
  cargo: '#22c55e',
  tanker: '#f59e0b',
  passenger: '#3b82f6',
  fishing: '#06b6d4',
  tug: '#8b5cf6',
  pleasure: '#ec4899',
  military: '#6b7280',
  other: '#9ca3af',
};

/** Formatta durata ore in stringa leggibile */
function formatDuration(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}min`;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  const days = Math.floor(hours / 24);
  const h = Math.round(hours % 24);
  return `${days}d ${h}h`;
}

/** Calcola la distribuzione per tipo nave */
function getTypeDistribution(visits: PortVisit[]): Array<{ type: ShipType; count: number; pct: number }> {
  const counts = new Map<string, number>();
  const seenMmsi = new Map<string, string>(); // mmsi → ship_type (conta vessel unici)

  for (const v of visits) {
    if (!seenMmsi.has(v.mmsi)) {
      seenMmsi.set(v.mmsi, v.ship_type);
      counts.set(v.ship_type, (counts.get(v.ship_type) ?? 0) + 1);
    }
  }

  const total = seenMmsi.size || 1;
  return [...counts.entries()]
    .map(([type, count]) => ({
      type: type as ShipType,
      count,
      pct: Math.round((count / total) * 100),
    }))
    .sort((a, b) => b.count - a.count);
}

/* ─────────────────── Page component ─────────────────── */

export default async function PortPage({ params }: PageProps) {
  const { name } = await params;
  const portName = decodeURIComponent(name);
  const port = await fetchPort(portName);

  if (!port) {
    return (
      <div style={containerStyle}>
        <a href="/" style={backLinkStyle}>&larr; Back to map</a>
        <h1 style={{ fontSize: 24, marginTop: 16 }}>Port Not Found</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 8 }}>
          No data available for port &ldquo;{portName}&rdquo;.
          Port names use coordinate format (e.g. &ldquo;41.12N, 16.88E&rdquo;).
        </p>
      </div>
    );
  }

  const typeDistribution = getTypeDistribution(port.recent_visits);
  const currentVessels = port.recent_visits.filter((v) => v.departed_at === null);
  const recentDepartures = port.recent_visits.filter((v) => v.departed_at !== null);

  return (
    <div style={containerStyle}>
      <a href="/" style={backLinkStyle}>&larr; Back to map</a>

      {/* Header */}
      <div style={{ marginTop: 16, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <span style={{ fontSize: 28 }}>⚓</span>
          <h1 style={{ fontSize: 24 }}>Port {port.port_name}</h1>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
          Coordinates: {port.lat.toFixed(4)}°N, {port.lon.toFixed(4)}°E
        </p>
      </div>

      {/* Stats cards */}
      <div style={statsGridStyle}>
        <StatCard
          label="Vessels Tracked"
          value={String(port.total_vessels_seen)}
          subtitle="Last 90 days"
          color="var(--accent)"
        />
        <StatCard
          label="Currently In Port"
          value={String(port.currently_in_port)}
          subtitle={port.currently_in_port > 0 ? 'Active now' : 'None at moment'}
          color="var(--success)"
        />
        <StatCard
          label="Avg. Stay"
          value={formatDuration(port.avg_stay_hours)}
          subtitle="Per vessel visit"
          color="var(--warning)"
        />
        <StatCard
          label="Total Visits"
          value={String(port.recent_visits.length)}
          subtitle="Arrivals recorded"
          color="#8b5cf6"
        />
      </div>

      {/* Vessel Type Distribution */}
      {typeDistribution.length > 0 && (
        <section style={sectionStyle}>
          <h2 style={sectionTitleStyle}>Vessel Mix</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {typeDistribution.map((t) => (
              <div key={t.type} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: VESSEL_COLORS[t.type] ?? '#9ca3af',
                  flexShrink: 0,
                }} />
                <span style={{ fontSize: 13, minWidth: 80 }}>{t.type}</span>
                <div style={{
                  flex: 1,
                  height: 6,
                  background: 'var(--bg-card)',
                  borderRadius: 3,
                  overflow: 'hidden',
                }}>
                  <div style={{
                    width: `${t.pct}%`,
                    height: '100%',
                    background: VESSEL_COLORS[t.type] ?? '#9ca3af',
                    borderRadius: 3,
                    transition: 'width 0.3s',
                  }} />
                </div>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', minWidth: 55, textAlign: 'right' }}>
                  {t.count} ({t.pct}%)
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Vessels Currently In Port */}
      {currentVessels.length > 0 && (
        <section style={sectionStyle}>
          <h2 style={sectionTitleStyle}>
            <span style={{ color: 'var(--success)', marginRight: 6 }}>●</span>
            Currently In Port ({currentVessels.length})
          </h2>
          <div style={{ display: 'grid', gap: 8 }}>
            {currentVessels.map((v) => (
              <VesselVisitCard key={`${v.mmsi}-${v.arrived_at}`} visit={v} inPort />
            ))}
          </div>
        </section>
      )}

      {/* Recent Visits */}
      {recentDepartures.length > 0 && (
        <section style={sectionStyle}>
          <h2 style={sectionTitleStyle}>Recent Visits ({recentDepartures.length})</h2>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Vessel</th>
                <th style={thStyle}>Type</th>
                <th style={thStyle}>Flag</th>
                <th style={thStyle}>Arrived</th>
                <th style={thStyle}>Departed</th>
                <th style={thStyle}>Duration</th>
              </tr>
            </thead>
            <tbody>
              {recentDepartures.slice(0, 50).map((v, i) => (
                <tr key={`${v.mmsi}-${v.arrived_at}-${i}`}>
                  <td style={tdStyle}>
                    <a
                      href={`/vessel/${v.mmsi}`}
                      style={{ color: 'var(--accent)', fontWeight: 500 }}
                    >
                      {v.vessel_name}
                    </a>
                  </td>
                  <td style={tdStyle}>
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: 12,
                    }}>
                      <span style={{
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        background: VESSEL_COLORS[v.ship_type] ?? '#9ca3af',
                      }} />
                      {v.ship_type}
                    </span>
                  </td>
                  <td style={tdStyle}>{v.flag || '—'}</td>
                  <td style={tdStyle}>
                    {new Date(v.arrived_at).toLocaleDateString(undefined, {
                      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                    })}
                  </td>
                  <td style={tdStyle}>
                    {v.departed_at
                      ? new Date(v.departed_at).toLocaleDateString(undefined, {
                          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                        })
                      : '—'}
                  </td>
                  <td style={tdStyle}>
                    <span style={{
                      background: 'var(--bg-card)',
                      padding: '2px 8px',
                      borderRadius: 4,
                      fontSize: 11,
                    }}>
                      {formatDuration(v.duration_hours)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Empty state */}
      {port.recent_visits.length === 0 && (
        <section style={{ ...sectionStyle, textAlign: 'center', padding: '40px 0' }}>
          <p style={{ fontSize: 40, marginBottom: 8 }}>🏗️</p>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
            No vessel visits recorded at this location yet.
            Data accumulates as vessels transit through the area.
          </p>
        </section>
      )}
    </div>
  );
}

/* ─────────────────── Sub-components ─────────────────── */

function StatCard({
  label,
  value,
  subtitle,
  color,
}: {
  label: string;
  value: string;
  subtitle: string;
  color: string;
}) {
  return (
    <div style={{
      background: 'var(--bg-secondary)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      padding: '16px 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
    }}>
      <span style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </span>
      <span style={{ fontSize: 26, fontWeight: 700, color, lineHeight: 1.2 }}>
        {value}
      </span>
      <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
        {subtitle}
      </span>
    </div>
  );
}

function VesselVisitCard({ visit, inPort }: { visit: PortVisit; inPort?: boolean }) {
  return (
    <div style={{
      background: 'var(--bg-secondary)',
      border: `1px solid ${inPort ? 'var(--success)' : 'var(--border)'}`,
      borderRadius: 8,
      padding: '12px 16px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
    }}>
      <div>
        <a
          href={`/vessel/${visit.mmsi}`}
          style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 14 }}
        >
          {visit.vessel_name}
        </a>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}>
            <span style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: VESSEL_COLORS[visit.ship_type] ?? '#9ca3af',
            }} />
            {visit.ship_type}
          </span>
          {visit.flag && <span style={{ marginLeft: 8 }}>{visit.flag}</span>}
          <span style={{ marginLeft: 8 }}>MMSI: {visit.mmsi}</span>
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        {inPort && (
          <span style={{
            background: '#22c55e22',
            color: 'var(--success)',
            padding: '2px 8px',
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 600,
          }}>
            IN PORT
          </span>
        )}
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
          Since {new Date(visit.arrived_at).toLocaleDateString(undefined, {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
          })}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
          {formatDuration(visit.duration_hours)}
        </div>
      </div>
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

const statsGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
  gap: 12,
  marginBottom: 24,
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
  display: 'flex',
  alignItems: 'center',
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

import type { Metadata } from 'next';
import type { PortInfo } from '../../../../shared/types';

interface PageProps {
  params: Promise<{ name: string }>;
}

/** Fetch dati porto dal backend (SSR) */
async function fetchPortInfo(name: string): Promise<PortInfo | null> {
  const base = process.env.API_BASE_URL || 'http://localhost:3001';
  try {
    const res = await fetch(`${base}/api/port/${encodeURIComponent(name)}`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    return res.json() as Promise<PortInfo>;
  } catch {
    return null;
  }
}

/** Formatta durata in ore in stringa leggibile */
function formatDuration(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}min`;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  const days = Math.floor(hours / 24);
  const h = Math.round(hours % 24);
  return `${days}d ${h}h`;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { name } = await params;
  const portName = decodeURIComponent(name);
  const portInfo = await fetchPortInfo(portName);

  if (!portInfo) {
    return { title: 'Port Not Found — AIS Vessel Tracker' };
  }

  return {
    title: `Port ${portInfo.port_name} — AIS Vessel Tracker`,
    description: `Vessel traffic at port ${portInfo.port_name} (${portInfo.lat.toFixed(4)}, ${portInfo.lon.toFixed(4)}). ${portInfo.total_vessels_seen} vessels tracked, ${portInfo.currently_in_port} currently in port.`,
  };
}

export default async function PortPage({ params }: PageProps) {
  const { name } = await params;
  const portName = decodeURIComponent(name);
  const portInfo = await fetchPortInfo(portName);

  if (!portInfo) {
    return (
      <div style={containerStyle}>
        <a href="/" style={{ fontSize: 13, marginBottom: 16, display: 'inline-block' }}>
          &larr; Back to map
        </a>
        <h1 style={{ fontSize: 24, marginBottom: 8 }}>Port Not Found</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
          No port data found for &quot;{portName}&quot;. The port may not have any recorded vessel activity.
        </p>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <a href="/" style={{ fontSize: 13, marginBottom: 16, display: 'inline-block' }}>
        &larr; Back to map
      </a>

      <h1 style={{ fontSize: 24, marginBottom: 4 }}>Port: {portInfo.port_name}</h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16 }}>
        Coordinates: {portInfo.lat.toFixed(4)}, {portInfo.lon.toFixed(4)}
      </p>

      {/* Stats */}
      <div style={gridStyle}>
        <InfoCard label="Vessels Seen" value={String(portInfo.total_vessels_seen)} />
        <InfoCard
          label="Currently In Port"
          value={String(portInfo.currently_in_port)}
          highlight={portInfo.currently_in_port > 0}
        />
        <InfoCard label="Avg Stay" value={formatDuration(portInfo.avg_stay_hours)} />
      </div>

      {/* Recent Visits */}
      {portInfo.recent_visits.length > 0 ? (
        <section style={sectionStyle}>
          <h2 style={sectionTitleStyle}>
            Recent Vessel Visits ({portInfo.recent_visits.length})
          </h2>
          <div style={{ overflowX: 'auto' }}>
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
                {portInfo.recent_visits.map((visit, i) => (
                  <tr key={`${visit.mmsi}-${i}`}>
                    <td style={tdStyle}>
                      <a href={`/vessel/${visit.mmsi}`}>
                        {visit.vessel_name}
                      </a>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                        {visit.mmsi}
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <span style={typeBadgeStyle(visit.ship_type)}>{visit.ship_type}</span>
                    </td>
                    <td style={tdStyle}>{visit.flag || 'N/A'}</td>
                    <td style={tdStyle}>
                      {new Date(visit.arrived_at).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td style={tdStyle}>
                      {visit.departed_at ? (
                        new Date(visit.departed_at).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      ) : (
                        <span style={{ color: '#22c55e', fontWeight: 600 }}>In port</span>
                      )}
                    </td>
                    <td style={tdStyle}>{formatDuration(visit.duration_hours)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section style={sectionStyle}>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
            No vessel visits recorded for this port in the last 90 days.
          </p>
        </section>
      )}
    </div>
  );
}

/** Card informativa per le stats */
function InfoCard({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        padding: '12px 16px',
        borderRadius: 8,
        border: '1px solid var(--border)',
      }}
    >
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600, color: highlight ? '#22c55e' : 'var(--text-primary)' }}>
        {value}
      </div>
    </div>
  );
}

/** Badge colorato per tipo nave */
function typeBadgeStyle(type: string): React.CSSProperties {
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
  const color = colors[type] ?? '#9ca3af';
  return {
    background: `${color}22`,
    color,
    padding: '2px 8px',
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'capitalize' as const,
  };
}

const containerStyle: React.CSSProperties = {
  maxWidth: 900,
  margin: '0 auto',
  padding: '24px 16px',
};

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
  gap: 8,
  marginBottom: 16,
};

const sectionStyle: React.CSSProperties = {
  marginTop: 24,
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 16,
  marginBottom: 12,
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
  padding: '8px 12px',
  borderBottom: '1px solid var(--border)',
  color: 'var(--text-secondary)',
  fontSize: 12,
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderBottom: '1px solid var(--border)',
};

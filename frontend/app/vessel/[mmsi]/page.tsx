import type { Metadata } from 'next';
import AnomalyBadge from '../../../components/AnomalyBadge';
import SanctionBadge from '../../../components/SanctionBadge';
import type { Vessel, VesselPosition, AnomalyEvent, SanctionRecord, PortCall } from '../../../../shared/types';

interface VesselDetail extends Vessel {
  last_position: VesselPosition | null;
  sanctions: SanctionRecord[];
  anomalies: AnomalyEvent[];
}

interface PageProps {
  params: Promise<{ mmsi: string }>;
}

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
  if (!vessel) return { title: 'Vessel Not Found' };
  return {
    title: `${vessel.name} (${vessel.mmsi}) — AIS Vessel Tracker`,
    description: `Track ${vessel.name} (MMSI: ${vessel.mmsi}, IMO: ${vessel.imo ?? 'N/A'}) — ${vessel.ship_type} vessel, flag ${vessel.flag ?? 'N/A'}`,
  };
}

export default async function VesselPage({ params }: PageProps) {
  const { mmsi } = await params;
  const [vessel, portCalls] = await Promise.all([
    fetchVessel(mmsi),
    fetchPortCalls(mmsi),
  ]);

  if (!vessel) {
    return (
      <div style={containerStyle}>
        <h1>Vessel Not Found</h1>
        <p>No vessel found with MMSI {mmsi}</p>
        <a href="/">Back to map</a>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <a href="/" style={{ fontSize: 13, marginBottom: 16, display: 'inline-block' }}>
        &larr; Back to map
      </a>

      <h1 style={{ fontSize: 24, marginBottom: 4 }}>{vessel.name}</h1>

      {/* Badges */}
      <div style={{ marginBottom: 16 }}>
        {vessel.sanctions.map((s, i) => (
          <SanctionBadge key={i} source={s.source} />
        ))}
        {vessel.anomalies.slice(0, 5).map((a, i) => (
          <AnomalyBadge key={i} type={a.type} />
        ))}
      </div>

      {/* Info grid */}
      <div style={gridStyle}>
        <InfoCard label="MMSI" value={vessel.mmsi} />
        <InfoCard label="IMO" value={vessel.imo ?? 'N/A'} />
        <InfoCard label="Type" value={vessel.ship_type} />
        <InfoCard label="Flag" value={vessel.flag ?? 'N/A'} />
        <InfoCard label="Size" value={`${vessel.length ?? '?'}m x ${vessel.width ?? '?'}m`} />
        <InfoCard label="Max Speed" value={vessel.max_speed ? `${vessel.max_speed} kn` : 'N/A'} />
      </div>

      {/* Last Position */}
      {vessel.last_position && (
        <section style={sectionStyle}>
          <h2 style={sectionTitleStyle}>Last Position</h2>
          <div style={gridStyle}>
            <InfoCard label="Lat / Lon" value={`${vessel.last_position.lat.toFixed(4)}, ${vessel.last_position.lon.toFixed(4)}`} />
            <InfoCard label="Speed" value={`${vessel.last_position.speed} kn`} />
            <InfoCard label="Course" value={`${vessel.last_position.course}°`} />
            <InfoCard label="Status" value={vessel.last_position.nav_status} />
            <InfoCard label="Updated" value={new Date(vessel.last_position.timestamp).toLocaleString()} />
          </div>
        </section>
      )}

      {/* Port Calls */}
      {portCalls.length > 0 && (
        <section style={sectionStyle}>
          <h2 style={sectionTitleStyle}>Port Calls (last 90 days)</h2>
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
                  <td style={tdStyle}>{pc.port_name}</td>
                  <td style={tdStyle}>{new Date(pc.arrived_at).toLocaleDateString()}</td>
                  <td style={tdStyle}>{pc.departed_at ? new Date(pc.departed_at).toLocaleDateString() : 'Still in port'}</td>
                  <td style={tdStyle}>{pc.duration_hours}h</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Anomalies */}
      {vessel.anomalies.length > 0 && (
        <section style={sectionStyle}>
          <h2 style={sectionTitleStyle}>Anomaly Events</h2>
          {vessel.anomalies.map((a, i) => (
            <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
              <AnomalyBadge type={a.type} />
              <span style={{ color: 'var(--text-secondary)', marginLeft: 8 }}>
                {new Date(a.detected_at).toLocaleString()}
              </span>
              {a.details && (
                <pre style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                  {JSON.stringify(a.details, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      padding: '12px 16px',
      borderRadius: 8,
      border: '1px solid var(--border)',
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14 }}>{value}</div>
    </div>
  );
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
};

const tdStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderBottom: '1px solid var(--border)',
};

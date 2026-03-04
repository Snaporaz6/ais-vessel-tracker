import type { Metadata } from 'next';

interface PageProps {
  params: Promise<{ name: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { name } = await params;
  const portName = decodeURIComponent(name);
  return {
    title: `Port ${portName} — AIS Vessel Tracker`,
    description: `Vessel traffic and activity at port ${portName}`,
  };
}

export default async function PortPage({ params }: PageProps) {
  const { name } = await params;
  const portName = decodeURIComponent(name);

  return (
    <div style={containerStyle}>
      <a href="/" style={{ fontSize: 13, marginBottom: 16, display: 'inline-block' }}>
        &larr; Back to map
      </a>

      <h1 style={{ fontSize: 24, marginBottom: 8 }}>Port: {portName}</h1>

      <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
        Port page coming soon. This page will show vessel traffic, current vessels in port,
        and historical arrival/departure data.
      </p>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  maxWidth: 900,
  margin: '0 auto',
  padding: '24px 16px',
};

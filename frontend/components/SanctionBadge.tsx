interface SanctionBadgeProps {
  source: 'OFAC' | 'EU';
}

export default function SanctionBadge({ source }: SanctionBadgeProps) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 4,
      fontSize: 11,
      fontWeight: 600,
      color: '#fff',
      background: source === 'OFAC' ? '#dc2626' : '#b91c1c',
      marginRight: 4,
      marginBottom: 2,
    }}>
      SANCTIONED ({source})
    </span>
  );
}

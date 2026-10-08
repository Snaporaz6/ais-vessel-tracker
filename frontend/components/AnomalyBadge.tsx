import type { AnomalyType } from "../../shared/types";

const LABELS: Record<AnomalyType, string> = {
  dark_activity: "Vuoto di osservazioni della nave",
  speed_anomaly: "Velocità insolita",
  impossible_movement: "Spostamento incompatibile",
  ais_spoofing: "Possibile alterazione AIS",
};

const COLORS: Record<AnomalyType, string> = {
  dark_activity: "#f59e0b",
  speed_anomaly: "#ef4444",
  impossible_movement: "#dc2626",
  ais_spoofing: "#7c3aed",
};

interface AnomalyBadgeProps {
  type: AnomalyType;
}

export default function AnomalyBadge({ type }: AnomalyBadgeProps) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 600,
        color: "#fff",
        background: COLORS[type] ?? "#6b7280",
        marginRight: 4,
        marginBottom: 2,
      }}
    >
      {LABELS[type] ?? type}
    </span>
  );
}

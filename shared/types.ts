/** Metadati statici di una nave */
export interface Vessel {
  mmsi: string;
  imo: string | null;
  name: string;
  ship_type: ShipType;
  flag: string;
  length: number | null;
  width: number | null;
  max_speed: number | null;
  destination: string | null;
  eta: string | null;
  updated_at: string;
}

/** Posizione AIS di una nave in un dato istante */
export interface VesselPosition {
  mmsi: string;
  lat: number;
  lon: number;
  speed: number | null;
  course: number | null;
  heading: number | null;
  nav_status: NavStatus;
  timestamp: string;
  significant?: boolean;
  gap_before?: boolean;
  anomaly_flags?: AnomalyType[];
}

/** Port call ricostruito dal track */
export interface PortCall {
  id?: string;
  mmsi: string;
  port_name: string;
  port_lat: number;
  port_lon: number;
  arrived_at: string;
  departed_at: string | null;
  duration_hours: number;
  last_seen_at?: string;
  uncertain_departure?: boolean;
}

/** Flag anomalia rilevata */
export interface AnomalyEvent {
  id?: string;
  mmsi: string;
  type: AnomalyType;
  detected_at: string;
  details: Record<string, unknown>;
}

/** Record sanzione */
export interface SanctionRecord {
  mmsi: string | null;
  imo: string | null;
  name: string;
  source: "OFAC" | "EU";
  listed_at: string;
  details_json: Record<string, unknown>;
}

/** Risposta API /map/live */
export interface LiveMapVessel {
  mmsi: string;
  name: string;
  ship_type: ShipType;
  lat: number;
  lon: number;
  speed: number | null;
  course: number | null;
  is_sanctioned: boolean;
  anomaly_flags: AnomalyType[];
  timestamp: string;
  sanction_status?: SanctionsCheck["status"];
}

export type ShipType =
  | "cargo"
  | "tanker"
  | "passenger"
  | "fishing"
  | "tug"
  | "pleasure"
  | "military"
  | "other";

export type NavStatus =
  | "underway_engine"
  | "at_anchor"
  | "not_under_command"
  | "moored"
  | "aground"
  | "fishing"
  | "underway_sailing"
  | "unknown";

export type AnomalyType =
  "dark_activity" | "speed_anomaly" | "impossible_movement" | "ais_spoofing";

/** Informazioni aggregate di un porto */
export interface PortInfo {
  results_limited: boolean;
  summary_scope: "recent_visits";
  port_name: string;
  lat: number;
  lon: number;
  total_vessels_seen: number;
  currently_in_port: number;
  avg_stay_hours: number;
  recent_visits: PortVisit[];
  total_visits: number;
}

/** Singola visita di una nave in un porto */
export interface PortVisit {
  mmsi: string;
  vessel_name: string;
  ship_type: ShipType;
  flag: string;
  arrived_at: string;
  departed_at: string | null;
  duration_hours: number;
}

export interface SanctionsCheck {
  status: "matched" | "no_match" | "stale" | "unavailable";
  checked_at: string | null;
  sources: {
    source: "OFAC" | "EU";
    updated_at: string | null;
    status: "ok" | "stale" | "unavailable";
  }[];
}

export interface VesselDetail extends Vessel {
  last_position: VesselPosition | null;
  sanctions: SanctionRecord[];
  sanctions_check: SanctionsCheck;
  anomalies: AnomalyEvent[];
  data_status: "ok" | "partial";
}

export interface SourceState {
  connected: boolean;
  subscribed: boolean;
  last_message_at: string | null;
  last_disconnect_at: string | null;
  status: "starting" | "live" | "stale" | "disconnected" | "demo";
  outages: { from: string; to: string | null }[];
}

export interface LiveMapResponse {
  vessels: LiveMapVessel[];
  total_live: number;
  total_in_bbox: number;
  truncated: boolean;
  source: SourceState;
  generated_at: string;
  history_started_at: string | null;
}

export interface ArchiveEntry {
  mmsi: string;
  day: string;
  object_key: string;
  checksum: string;
  point_count: number;
  compressed_bytes: number;
  first_at: string;
  last_at: string;
  interval_seconds: number;
  updated_at: string;
  last_position: VesselPosition;
}

export interface TrackMetadata {
  requested_days: number;
  first_at: string | null;
  last_at: string | null;
  available_points: number;
  returned_points: number;
  sampled: boolean;
  gaps: { from: string; to: string }[];
  intervals: { maxAgeDays: number; intervalSeconds: number }[];
}

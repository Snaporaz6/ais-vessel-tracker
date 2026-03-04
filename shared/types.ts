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
  updated_at: string;
}

/** Posizione AIS di una nave in un dato istante */
export interface VesselPosition {
  mmsi: string;
  lat: number;
  lon: number;
  speed: number;
  course: number;
  heading: number;
  nav_status: NavStatus;
  timestamp: string;
}

/** Port call ricostruito dal track */
export interface PortCall {
  mmsi: string;
  port_name: string;
  port_lat: number;
  port_lon: number;
  arrived_at: string;
  departed_at: string | null;
  duration_hours: number;
}

/** Flag anomalia rilevata */
export interface AnomalyEvent {
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
  source: 'OFAC' | 'EU';
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
  speed: number;
  course: number;
  is_sanctioned: boolean;
  anomaly_flags: AnomalyType[];
}

export type ShipType =
  | 'cargo'
  | 'tanker'
  | 'passenger'
  | 'fishing'
  | 'tug'
  | 'pleasure'
  | 'military'
  | 'other';

export type NavStatus =
  | 'underway_engine'
  | 'at_anchor'
  | 'not_under_command'
  | 'moored'
  | 'aground'
  | 'fishing'
  | 'underway_sailing'
  | 'unknown';

export type AnomalyType =
  | 'dark_activity'
  | 'speed_anomaly'
  | 'impossible_movement'
  | 'ais_spoofing';

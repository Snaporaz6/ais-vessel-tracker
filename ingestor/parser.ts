import type { Vessel, VesselPosition, ShipType, NavStatus } from '../shared/types.js';

/** Messaggio raw da aisstream.io */
interface AISStreamMessage {
  MessageType: string;
  MetaData: {
    MMSI: number;
    MMSI_String: string;
    ShipName: string;
    latitude: number;
    longitude: number;
    time_utc: string;
  };
  Message: {
    PositionReport?: {
      Sog: number;
      Cog: number;
      TrueHeading: number;
      NavigationalStatus: number;
      UserID: number;
    };
    ShipStaticData?: {
      ImoNumber: number;
      Name: string;
      Type: number;
      Dimension: {
        A: number;
        B: number;
        C: number;
        D: number;
      };
      MaximumStaticDraught: number;
      CallSign: string;
    };
  };
}

/** Mappa codice navigational status AIS -> nostro enum */
const NAV_STATUS_MAP: Record<number, NavStatus> = {
  0: 'underway_engine',
  1: 'at_anchor',
  2: 'not_under_command',
  3: 'unknown', // restricted manoeuvrability -> unknown per MVP
  4: 'unknown', // constrained by draught
  5: 'moored',
  6: 'aground',
  7: 'fishing',
  8: 'underway_sailing',
};

/** Mappa AIS ship type code -> nostro ShipType */
function mapShipType(aisType: number): ShipType {
  if (aisType >= 70 && aisType <= 79) return 'cargo';
  if (aisType >= 80 && aisType <= 89) return 'tanker';
  if (aisType >= 60 && aisType <= 69) return 'passenger';
  if (aisType === 30) return 'fishing';
  if (aisType >= 31 && aisType <= 32) return 'tug';
  if (aisType >= 36 && aisType <= 37) return 'pleasure';
  if (aisType === 35) return 'military';
  return 'other';
}

/** Risultato del parsing — posizione o dati statici nave */
export type ParseResult =
  | { type: 'position'; position: VesselPosition }
  | { type: 'static'; vessel: Partial<Vessel> & { mmsi: string } };

/** Parsa un messaggio raw di aisstream.io */
export function parseAISMessage(raw: string): ParseResult | null {
  let msg: AISStreamMessage;
  try {
    msg = JSON.parse(raw) as AISStreamMessage;
  } catch {
    return null;
  }

  const mmsi = msg.MetaData?.MMSI_String;
  if (!mmsi) return null;

  if (msg.MessageType === 'PositionReport' && msg.Message.PositionReport) {
    const pr = msg.Message.PositionReport;
    const position: VesselPosition = {
      mmsi,
      lat: msg.MetaData.latitude,
      lon: msg.MetaData.longitude,
      speed: pr.Sog,
      course: pr.Cog,
      heading: pr.TrueHeading === 511 ? pr.Cog : pr.TrueHeading,
      nav_status: NAV_STATUS_MAP[pr.NavigationalStatus] ?? 'unknown',
      timestamp: msg.MetaData.time_utc,
    };
    return { type: 'position', position };
  }

  if (msg.MessageType === 'ShipStaticData' && msg.Message.ShipStaticData) {
    const sd = msg.Message.ShipStaticData;
    const dim = sd.Dimension;
    const vessel: Partial<Vessel> & { mmsi: string } = {
      mmsi,
      name: sd.Name?.trim() || msg.MetaData.ShipName?.trim() || 'UNKNOWN',
      ship_type: mapShipType(sd.Type),
      imo: sd.ImoNumber > 0 ? String(sd.ImoNumber) : null,
      length: dim ? dim.A + dim.B : null,
      width: dim ? dim.C + dim.D : null,
    };
    return { type: 'static', vessel };
  }

  return null;
}

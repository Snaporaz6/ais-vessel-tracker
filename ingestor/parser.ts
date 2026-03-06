import type { Vessel, VesselPosition, ShipType, NavStatus } from '../shared/types.js';

/** Messaggio raw da aisstream.io */
interface AISStreamMessage {
  MessageType: string;
  MetaData: {
    MMSI: number;
    MMSI_String: number | string; // aisstream restituisce un numero, non stringa
    ShipName: string;
    latitude: number;
    longitude: number;
    time_utc: string;
  };
  Message: {
    PositionReport?: AISPositionData;
    StandardClassBPositionReport?: AISPositionData;
    ShipStaticData?: AISStaticData;
  };
}

interface AISPositionData {
  Sog: number;
  Cog: number;
  TrueHeading: number;
  NavigationalStatus?: number;
  UserID: number;
  Latitude?: number;
  Longitude?: number;
}

interface AISStaticData {
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
  Destination: string;
  Eta: {
    Month: number;
    Day: number;
    Hour: number;
    Minute: number;
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

/**
 * Normalizza il timestamp di aisstream.io per PostgreSQL.
 * Input:  "2026-03-06 14:10:48.636890157 +0000 UTC"
 * Output: "2026-03-06T14:10:48.636+00:00"
 * PostgreSQL non accetta il suffisso "UTC" e i nanosecondi oltre 6 cifre.
 */
function normalizeTimestamp(raw: string): string {
  if (!raw) return new Date().toISOString();

  // Rimuovi il suffisso " UTC"
  let ts = raw.replace(/\s*UTC\s*$/, '').trim();

  // Tronca nanosecondi a millisecondi (max 3 cifre decimali)
  // "14:10:48.636890157" -> "14:10:48.636"
  ts = ts.replace(/(\.\d{3})\d+/, '$1');

  // Rimuovi lo spazio prima del timezone offset: ".636 +0000" -> ".636+0000"
  ts = ts.replace(/\s+\+/, '+');

  // Converti "+0000" -> "+00:00" per ISO 8601
  ts = ts.replace(/\+(\d{2})(\d{2})$/, '+$1:$2');

  // Sostituisci spazio tra data e ora con "T"
  ts = ts.replace(/^(\d{4}-\d{2}-\d{2})\s+/, '$1T');

  // Verifica che il risultato sia una data valida
  const d = new Date(ts);
  if (isNaN(d.getTime())) {
    return new Date().toISOString();
  }

  return ts;
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

  // MMSI_String puo arrivare come numero — convertiamo sempre a stringa
  const mmsi = String(msg.MetaData?.MMSI_String ?? msg.MetaData?.MMSI ?? '');
  if (!mmsi || mmsi === 'undefined') return null;

  // aisstream.io timestamp: "2026-03-06 14:10:48.636890157 +0000 UTC"
  // PostgreSQL non accetta il suffisso "UTC" — lo rimuoviamo
  const rawTs = msg.MetaData?.time_utc ?? '';
  const timestamp = normalizeTimestamp(rawTs);

  // PositionReport (tipo 1,2,3) e StandardClassBPositionReport (tipo 18)
  const pr = msg.Message?.PositionReport ?? msg.Message?.StandardClassBPositionReport;
  if (
    (msg.MessageType === 'PositionReport' || msg.MessageType === 'StandardClassBPositionReport') &&
    pr
  ) {
    const position: VesselPosition = {
      mmsi,
      lat: msg.MetaData.latitude,
      lon: msg.MetaData.longitude,
      speed: pr.Sog,
      course: pr.Cog,
      heading: pr.TrueHeading === 511 ? pr.Cog : pr.TrueHeading,
      nav_status: NAV_STATUS_MAP[pr.NavigationalStatus ?? 15] ?? 'unknown',
      timestamp,
    };
    return { type: 'position', position };
  }

  // ShipStaticData (tipo 5)
  if (msg.MessageType === 'ShipStaticData' && msg.Message?.ShipStaticData) {
    const sd = msg.Message.ShipStaticData;
    const dim = sd.Dimension;

    // Destination: stringa libera, spesso in maiuscolo con spazi
    const rawDest = sd.Destination?.trim() || null;
    const destination = rawDest && rawDest !== '' && rawDest !== '@@@@@@@@@@@@@@@@@@@@' ? rawDest : null;

    // ETA: Month=0, Hour=24, Minute=60 indicano "non disponibile"
    let eta: string | null = null;
    if (sd.Eta && sd.Eta.Month > 0 && sd.Eta.Month <= 12 && sd.Eta.Day > 0 && sd.Eta.Day <= 31) {
      const hour = sd.Eta.Hour < 24 ? sd.Eta.Hour : 0;
      const minute = sd.Eta.Minute < 60 ? sd.Eta.Minute : 0;
      // Usa anno corrente; se il mese è già passato, assume anno prossimo
      const now = new Date();
      let year = now.getFullYear();
      if (sd.Eta.Month < now.getMonth() + 1) {
        year += 1;
      }
      const etaDate = new Date(Date.UTC(year, sd.Eta.Month - 1, sd.Eta.Day, hour, minute));
      if (!isNaN(etaDate.getTime())) {
        eta = etaDate.toISOString();
      }
    }

    const vessel: Partial<Vessel> & { mmsi: string } = {
      mmsi,
      name: sd.Name?.trim() || msg.MetaData.ShipName?.trim() || 'UNKNOWN',
      ship_type: mapShipType(sd.Type),
      imo: sd.ImoNumber > 0 ? String(sd.ImoNumber) : null,
      length: dim ? dim.A + dim.B : null,
      width: dim ? dim.C + dim.D : null,
      destination,
      eta,
    };
    return { type: 'static', vessel };
  }

  return null;
}

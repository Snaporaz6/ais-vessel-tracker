import type { VesselPosition } from '../shared/types.js';
import { MEDITERRANEAN_BBOX, DEDUP_INTERVAL_SEC } from '../shared/config.js';

/** Cache ultime posizioni per deduplicazione temporale */
const lastSeen = new Map<string, number>();

/** Pulisci la cache periodicamente per evitare memory leak */
const CACHE_CLEANUP_INTERVAL = 60_000 * 10; // ogni 10 minuti
setInterval(() => {
  const cutoff = Date.now() - DEDUP_INTERVAL_SEC * 1000 * 10;
  for (const [mmsi, ts] of lastSeen) {
    if (ts < cutoff) lastSeen.delete(mmsi);
  }
}, CACHE_CLEANUP_INTERVAL).unref();

/** Valida MMSI: 9 cifre, non inizia con 0 */
function isValidMmsi(mmsi: string): boolean {
  return /^[1-9]\d{8}$/.test(mmsi);
}

/** Valida coordinate geografiche */
function isValidCoord(lat: number, lon: number): boolean {
  return (
    lat !== 0 &&
    lon !== 0 &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

/** Verifica se la posizione e nel bounding box configurato */
function isInBbox(lat: number, lon: number): boolean {
  const bbox = MEDITERRANEAN_BBOX;
  return (
    lat >= bbox.latMin &&
    lat <= bbox.latMax &&
    lon >= bbox.lonMin &&
    lon <= bbox.lonMax
  );
}

/** Verifica deduplicazione temporale */
function isDuplicate(mmsi: string, timestampStr: string): boolean {
  const ts = new Date(timestampStr).getTime();
  const last = lastSeen.get(mmsi);
  if (last && ts - last < DEDUP_INTERVAL_SEC * 1000) {
    return true;
  }
  lastSeen.set(mmsi, ts);
  return false;
}

/**
 * Filtra una posizione AIS secondo le regole MVP.
 * Restituisce true se la posizione e valida e va salvata.
 */
export function shouldAcceptPosition(pos: VesselPosition): boolean {
  if (!isValidMmsi(pos.mmsi)) return false;
  if (!isValidCoord(pos.lat, pos.lon)) return false;
  if (pos.speed < 0 || pos.speed > 100) return false;
  if (!isInBbox(pos.lat, pos.lon)) return false;
  if (isDuplicate(pos.mmsi, pos.timestamp)) return false;
  return true;
}

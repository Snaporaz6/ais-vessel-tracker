import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getDistance } from 'geolib';
import type { VesselPosition, AnomalyType } from '../shared/types.js';
import {
  DARK_ACTIVITY_GAP_HOURS,
  DARK_ACTIVITY_MIN_LAT,
  DARK_ACTIVITY_MAX_LAT,
  SPEED_ANOMALY_MULTIPLIER,
} from '../shared/config.js';

/** Velocita max tipiche per tipo nave (knots) */
const MAX_SPEED_BY_TYPE: Record<string, number> = {
  cargo: 20,
  tanker: 18,
  passenger: 30,
  fishing: 15,
  tug: 16,
  pleasure: 25,
  military: 35,
  other: 25,
};

/** Cache ultime posizioni note per MMSI */
const lastPositions = new Map<string, VesselPosition>();

let supabase: SupabaseClient;

/** Inizializza il detector (usa lo stesso client Supabase) */
export function initAnomalyDetector(): void {
  const url = process.env['SUPABASE_URL'];
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!url || !key) return;
  supabase = createClient(url, key);
}

/** Analisi per anomalia tipo */
interface AnomalyCheck {
  type: AnomalyType;
  details: Record<string, unknown>;
}

/**
 * Controlla una nuova posizione per anomalie confrontandola con l'ultima nota.
 * Restituisce eventuali anomalie rilevate.
 */
export function checkAnomalies(
  pos: VesselPosition,
  vesselType?: string,
  vesselMaxSpeed?: number | null
): AnomalyCheck[] {
  const anomalies: AnomalyCheck[] = [];
  const prev = lastPositions.get(pos.mmsi);

  if (prev) {
    const prevTime = new Date(prev.timestamp).getTime();
    const currTime = new Date(pos.timestamp).getTime();
    const gapHours = (currTime - prevTime) / (1000 * 60 * 60);

    // Dark activity: gap > soglia in zona non polare
    if (gapHours >= DARK_ACTIVITY_GAP_HOURS) {
      const isNonPolar =
        prev.lat > DARK_ACTIVITY_MIN_LAT &&
        prev.lat < DARK_ACTIVITY_MAX_LAT &&
        pos.lat > DARK_ACTIVITY_MIN_LAT &&
        pos.lat < DARK_ACTIVITY_MAX_LAT;

      if (isNonPolar) {
        anomalies.push({
          type: 'dark_activity',
          details: {
            gap_hours: Math.round(gapHours * 10) / 10,
            last_lat: prev.lat,
            last_lon: prev.lon,
          },
        });
      }
    }

    // Speed anomaly: velocita implicita eccessiva
    const distMeters = getDistance(
      { latitude: prev.lat, longitude: prev.lon },
      { latitude: pos.lat, longitude: pos.lon }
    );
    const gapSeconds = (currTime - prevTime) / 1000;

    if (gapSeconds > 0) {
      const impliedSpeedKnots = (distMeters / 1852) / (gapSeconds / 3600);
      const maxSpeed = vesselMaxSpeed ?? MAX_SPEED_BY_TYPE[vesselType ?? 'other'] ?? 25;
      const threshold = maxSpeed * SPEED_ANOMALY_MULTIPLIER;

      if (impliedSpeedKnots > threshold) {
        anomalies.push({
          type: 'speed_anomaly',
          details: {
            implied_speed_knots: Math.round(impliedSpeedKnots * 10) / 10,
            max_expected: threshold,
            distance_nm: Math.round(distMeters / 1852 * 10) / 10,
            gap_seconds: Math.round(gapSeconds),
          },
        });
      }

      // Impossible movement: teletrasporto (> 1000 nm in < 1 ora)
      const distNm = distMeters / 1852;
      if (distNm > 1000 && gapHours < 1) {
        anomalies.push({
          type: 'impossible_movement',
          details: {
            distance_nm: Math.round(distNm),
            gap_minutes: Math.round(gapHours * 60),
          },
        });
      }
    }
  }

  lastPositions.set(pos.mmsi, pos);
  return anomalies;
}

/** Salva le anomalie rilevate su Supabase */
export async function saveAnomalies(mmsi: string, anomalies: AnomalyCheck[]): Promise<void> {
  if (!supabase || anomalies.length === 0) return;

  const rows = anomalies.map((a) => ({
    mmsi,
    type: a.type,
    detected_at: new Date().toISOString(),
    details: a.details,
  }));

  try {
    const { error } = await supabase.from('anomaly_events').insert(rows);
    if (error) {
      console.log(JSON.stringify({ event: 'anomaly_save_error', mmsi, error: error.message }));
    } else {
      console.log(JSON.stringify({ event: 'anomalies_saved', mmsi, count: rows.length, types: anomalies.map(a => a.type) }));
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(JSON.stringify({ event: 'anomaly_save_exception', mmsi, error: message }));
  }
}

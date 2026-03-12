import { Router, type Request, type Response, type NextFunction } from 'express';
import { getSupabase } from '../services/supabase.js';
import { ValidationError } from '../../shared/errors.js';
import {
  PORT_CALL_SPEED_THRESHOLD,
  PORT_CALL_MIN_DURATION_MIN,
  PORT_PROXIMITY_DELTA,
  RETENTION_DAYS,
} from '../../shared/config.js';
import type { PortInfo, PortVisit, ShipType } from '../../shared/types.js';

const router = Router();

/**
 * Parsa il nome del porto nel formato "41.12N, 16.88E" e restituisce lat/lon.
 * Supporta sia numeri positivi (N/E impliciti) sia formati espliciti.
 */
function parsePortCoords(name: string): { lat: number; lon: number } | null {
  // Formato: "41.12N, 16.88E" oppure "41.12, 16.88"
  const match = name.match(
    /^(-?\d+\.?\d*)\s*([NS])?\s*,\s*(-?\d+\.?\d*)\s*([EW])?$/i
  );
  if (!match) return null;

  let lat = parseFloat(match[1]!);
  let lon = parseFloat(match[3]!);

  if (match[2]?.toUpperCase() === 'S') lat = -lat;
  if (match[4]?.toUpperCase() === 'W') lon = -lon;

  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

/**
 * Ricostruisce le visite al porto dalle posizioni dei vessel nel raggio.
 * Raggruppa per MMSI, identifica arrivo/partenza/durata.
 */
function reconstructVisits(
  rows: Array<{ mmsi: string; timestamp: string; speed: number }>,
  vesselMap: Map<string, { name: string; ship_type: ShipType; flag: string }>
): PortVisit[] {
  // Raggruppa per MMSI e ordina per timestamp
  const byMmsi = new Map<string, Array<{ timestamp: string; speed: number }>>();
  for (const row of rows) {
    let arr = byMmsi.get(row.mmsi);
    if (!arr) {
      arr = [];
      byMmsi.set(row.mmsi, arr);
    }
    arr.push({ timestamp: row.timestamp, speed: row.speed });
  }

  const visits: PortVisit[] = [];

  for (const [mmsi, positions] of byMmsi) {
    // Ordina cronologicamente
    positions.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    let stoppedStart: string | null = null;
    let lastTimestamp: string | null = null;

    for (const pos of positions) {
      if (pos.speed <= PORT_CALL_SPEED_THRESHOLD) {
        if (!stoppedStart) stoppedStart = pos.timestamp;
        lastTimestamp = pos.timestamp;
      } else {
        if (stoppedStart && lastTimestamp) {
          const durationMs = new Date(lastTimestamp).getTime() - new Date(stoppedStart).getTime();
          const durationMin = durationMs / (1000 * 60);

          if (durationMin >= PORT_CALL_MIN_DURATION_MIN) {
            const info = vesselMap.get(mmsi);
            visits.push({
              mmsi,
              vessel_name: info?.name ?? 'UNKNOWN',
              ship_type: info?.ship_type ?? 'other',
              flag: info?.flag ?? '',
              arrived_at: stoppedStart,
              departed_at: lastTimestamp,
              duration_hours: Math.round(durationMin / 60 * 10) / 10,
            });
          }
        }
        stoppedStart = null;
        lastTimestamp = null;
      }
    }

    // Nave ancora ferma in porto
    if (stoppedStart && lastTimestamp) {
      const durationMs = new Date(lastTimestamp).getTime() - new Date(stoppedStart).getTime();
      const durationMin = durationMs / (1000 * 60);

      if (durationMin >= PORT_CALL_MIN_DURATION_MIN) {
        const info = vesselMap.get(mmsi);
        visits.push({
          mmsi,
          vessel_name: info?.name ?? 'UNKNOWN',
          ship_type: info?.ship_type ?? 'other',
          flag: info?.flag ?? '',
          arrived_at: stoppedStart,
          departed_at: null, // ancora in porto
          duration_hours: Math.round(durationMin / 60 * 10) / 10,
        });
      }
    }
  }

  // Ordina per arrivo decrescente (piu recenti prima)
  visits.sort((a, b) => new Date(b.arrived_at).getTime() - new Date(a.arrived_at).getTime());
  return visits;
}

/** GET /api/port/:name — Dati aggregati di un porto */
router.get('/:name', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const name = decodeURIComponent(req.params['name'] ?? '');
    const coords = parsePortCoords(name);

    if (!coords) {
      throw new ValidationError(
        'Invalid port name format. Expected "LAT, LON" (e.g. "41.12N, 16.88E")'
      );
    }

    const supabase = getSupabase();
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

    // Query posizioni nel raggio del porto negli ultimi 90 giorni
    const { data: posData, error: posErr } = await supabase
      .from('vessel_positions')
      .select('mmsi, timestamp, speed')
      .gte('lat', coords.lat - PORT_PROXIMITY_DELTA)
      .lte('lat', coords.lat + PORT_PROXIMITY_DELTA)
      .gte('lon', coords.lon - PORT_PROXIMITY_DELTA)
      .lte('lon', coords.lon + PORT_PROXIMITY_DELTA)
      .lte('speed', PORT_CALL_SPEED_THRESHOLD * 3) // filtra navi in transito veloce
      .gte('timestamp', cutoff)
      .order('timestamp', { ascending: true })
      .limit(10000);

    if (posErr) {
      console.log(JSON.stringify({ event: 'port_query_error', error: posErr.message, port: name }));
      throw new Error('Database query failed');
    }

    const positions = posData ?? [];

    // Raccogli MMSI unici per arricchire con dati vessel
    const uniqueMmsis = [...new Set(positions.map((p) => p.mmsi))];

    const vesselMap = new Map<string, { name: string; ship_type: ShipType; flag: string }>();

    if (uniqueMmsis.length > 0) {
      // Query batch per i dati statici delle navi (max 100 per query Supabase)
      const batchSize = 100;
      for (let i = 0; i < uniqueMmsis.length; i += batchSize) {
        const batch = uniqueMmsis.slice(i, i + batchSize);
        const { data: vesselData } = await supabase
          .from('vessels')
          .select('mmsi, name, ship_type, flag')
          .in('mmsi', batch);

        for (const v of vesselData ?? []) {
          vesselMap.set(v.mmsi, {
            name: v.name,
            ship_type: v.ship_type as ShipType,
            flag: v.flag ?? '',
          });
        }
      }
    }

    // Ricostruisci visite
    const allVisits = reconstructVisits(
      positions as Array<{ mmsi: string; timestamp: string; speed: number }>,
      vesselMap
    );

    // Calcola statistiche
    const currentlyInPort = allVisits.filter((v) => v.departed_at === null).length;
    const completedVisits = allVisits.filter((v) => v.departed_at !== null);
    const avgStayHours =
      completedVisits.length > 0
        ? Math.round(
            (completedVisits.reduce((sum, v) => sum + v.duration_hours, 0) /
              completedVisits.length) *
              10
          ) / 10
        : 0;

    const result: PortInfo = {
      port_name: name,
      lat: coords.lat,
      lon: coords.lon,
      total_vessels_seen: new Set(allVisits.map((v) => v.mmsi)).size,
      currently_in_port: currentlyInPort,
      avg_stay_hours: avgStayHours,
      recent_visits: allVisits.slice(0, 50),
    };

    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;

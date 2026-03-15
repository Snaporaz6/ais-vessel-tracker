import { Router, type Request, type Response, type NextFunction } from 'express';
import { getSupabase } from '../services/supabase.js';
import { ValidationError } from '../../shared/errors.js';
import {
  PORT_CALL_SPEED_THRESHOLD,
  PORT_CALL_MIN_DURATION_MIN,
  PORT_PROXIMITY_DELTA,
  PORT_MAX_RECENT_VISITS,
  RETENTION_DAYS,
} from '../../shared/config.js';
import type { PortInfo, PortVisit, ShipType } from '../../shared/types.js';

const router = Router();

/** Posizione grezza dal DB usata per ricostruzione visite */
interface RawPosition {
  mmsi: string;
  lat: number;
  lon: number;
  speed: number;
  timestamp: string;
}

/** Record vessel dal DB */
interface VesselRecord {
  mmsi: string;
  name: string;
  ship_type: string;
  flag: string | null;
}

/**
 * Parsa il nome porto (formato "41.12N, 16.88E") ed estrae lat/lon numerici.
 * Il segno e' gia' nel numero (es. "-5.50E" per longitudine ovest).
 */
function parsePortCoords(name: string): { lat: number; lon: number } {
  const match = name.match(/^(-?\d+\.?\d*)[NS],\s*(-?\d+\.?\d*)[EW]$/);
  if (!match) {
    throw new ValidationError(
      'Invalid port name format. Expected "lat[N/S], lon[E/W]" (e.g. "41.12N, 16.88E")'
    );
  }
  const lat = parseFloat(match[1]!);
  const lon = parseFloat(match[2]!);
  if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    throw new ValidationError('Port coordinates out of range');
  }
  return { lat, lon };
}

/**
 * Ricostruisce le visite individuali delle navi in un porto
 * raggruppando posizioni ferme per MMSI.
 */
function reconstructVisits(
  positions: RawPosition[],
  vesselMap: Map<string, VesselRecord>
): PortVisit[] {
  // Raggruppa posizioni per MMSI
  const byMmsi = new Map<string, RawPosition[]>();
  for (const pos of positions) {
    const list = byMmsi.get(pos.mmsi);
    if (list) {
      list.push(pos);
    } else {
      byMmsi.set(pos.mmsi, [pos]);
    }
  }

  const visits: PortVisit[] = [];

  for (const [mmsi, mmsiPositions] of byMmsi) {
    // Le posizioni sono gia' ordinate per timestamp ASC dalla query
    let visitStart: RawPosition | null = null;
    let visitEnd: RawPosition | null = null;

    for (const pos of mmsiPositions) {
      if (!visitStart) {
        visitStart = pos;
        visitEnd = pos;
        continue;
      }

      // Se il gap tra posizioni consecutive e' > 6h, chiudi visita e iniziane una nuova
      const gapMs =
        new Date(pos.timestamp).getTime() - new Date(visitEnd!.timestamp).getTime();
      const gapHours = gapMs / (1000 * 60 * 60);

      if (gapHours > 6) {
        // Chiudi visita corrente
        const durationMin =
          (new Date(visitEnd!.timestamp).getTime() - new Date(visitStart.timestamp).getTime()) /
          (1000 * 60);
        if (durationMin >= PORT_CALL_MIN_DURATION_MIN) {
          const vessel = vesselMap.get(mmsi);
          visits.push({
            mmsi,
            vessel_name: vessel?.name ?? 'UNKNOWN',
            ship_type: (vessel?.ship_type ?? 'other') as ShipType,
            flag: vessel?.flag ?? '',
            arrived_at: visitStart.timestamp,
            departed_at: visitEnd!.timestamp,
            duration_hours: Math.round((durationMin / 60) * 10) / 10,
          });
        }
        visitStart = pos;
        visitEnd = pos;
      } else {
        visitEnd = pos;
      }
    }

    // Chiudi ultima visita
    if (visitStart && visitEnd) {
      const durationMin =
        (new Date(visitEnd.timestamp).getTime() - new Date(visitStart.timestamp).getTime()) /
        (1000 * 60);
      if (durationMin >= PORT_CALL_MIN_DURATION_MIN) {
        const vessel = vesselMap.get(mmsi);
        // Se l'ultima posizione e' recente (< 1h), la nave potrebbe essere ancora in porto
        const lastPosAge =
          (Date.now() - new Date(visitEnd.timestamp).getTime()) / (1000 * 60 * 60);
        const stillInPort = lastPosAge < 1;

        visits.push({
          mmsi,
          vessel_name: vessel?.name ?? 'UNKNOWN',
          ship_type: (vessel?.ship_type ?? 'other') as ShipType,
          flag: vessel?.flag ?? '',
          arrived_at: visitStart.timestamp,
          departed_at: stillInPort ? null : visitEnd.timestamp,
          duration_hours: Math.round((durationMin / 60) * 10) / 10,
        });
      }
    }
  }

  // Ordina per arrivo piu' recente
  visits.sort((a, b) => new Date(b.arrived_at).getTime() - new Date(a.arrived_at).getTime());

  return visits;
}

/**
 * GET /api/port/:name
 * Restituisce info aggregate di un porto con visite recenti.
 */
router.get('/:name', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const portName = decodeURIComponent(req.params['name'] ?? '');
    const { lat, lon } = parsePortCoords(portName);

    const supabase = getSupabase();
    const retentionAgo = new Date(
      Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();

    // Query posizioni ferme vicino al porto negli ultimi 90 giorni
    const { data: rawPositions, error } = await supabase
      .from('vessel_positions')
      .select('mmsi, lat, lon, speed, timestamp')
      .gte('lat', lat - PORT_PROXIMITY_DELTA)
      .lte('lat', lat + PORT_PROXIMITY_DELTA)
      .gte('lon', lon - PORT_PROXIMITY_DELTA)
      .lte('lon', lon + PORT_PROXIMITY_DELTA)
      .lte('speed', PORT_CALL_SPEED_THRESHOLD)
      .gte('timestamp', retentionAgo)
      .order('timestamp', { ascending: true })
      .limit(10000);

    if (error) {
      console.log(
        JSON.stringify({ event: 'port_query_error', port: portName, error: error.message })
      );
    }

    const positions = (rawPositions ?? []) as RawPosition[];

    // Raccolta MMSI unici per arricchimento dati vessel
    const uniqueMmsis = [...new Set(positions.map((p) => p.mmsi))];

    // Query vessels per nome, tipo, flag
    let vesselMap = new Map<string, VesselRecord>();
    if (uniqueMmsis.length > 0) {
      const { data: vessels } = await supabase
        .from('vessels')
        .select('mmsi, name, ship_type, flag')
        .in('mmsi', uniqueMmsis);

      if (vessels) {
        for (const v of vessels as VesselRecord[]) {
          vesselMap.set(v.mmsi, v);
        }
      }
    }

    // Ricostruisci visite
    const allVisits = reconstructVisits(positions, vesselMap);
    const recentVisits = allVisits.slice(0, PORT_MAX_RECENT_VISITS);

    // Stats
    const currentlyInPort = allVisits.filter((v) => v.departed_at === null).length;
    const totalDurations = allVisits.map((v) => v.duration_hours);
    const avgStayHours =
      totalDurations.length > 0
        ? Math.round((totalDurations.reduce((s, d) => s + d, 0) / totalDurations.length) * 10) / 10
        : 0;

    const result: PortInfo = {
      port_name: portName,
      lat,
      lon,
      total_vessels_seen: uniqueMmsis.length,
      currently_in_port: currentlyInPort,
      avg_stay_hours: avgStayHours,
      recent_visits: recentVisits,
    };

    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;

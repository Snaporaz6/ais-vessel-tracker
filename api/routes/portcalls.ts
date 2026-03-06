import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { getSupabase } from '../services/supabase.js';
import { ValidationError } from '../../shared/errors.js';
import {
  PORT_CALL_SPEED_THRESHOLD,
  PORT_CALL_MIN_DURATION_MIN,
} from '../../shared/config.js';
import type { VesselPosition, PortCall } from '../../shared/types.js';

const router = Router();

const paramsSchema = z.object({
  mmsi: z.string().regex(/^[1-9]\d{8}$/),
});

/**
 * Ricostruisce i port call dal track della nave.
 * Un port call e quando la nave e "ferma" (speed < soglia) per > N minuti.
 */
function reconstructPortCalls(positions: VesselPosition[], mmsi: string): PortCall[] {
  const portCalls: PortCall[] = [];
  let stoppedStart: VesselPosition | null = null;
  let stoppedPositions: VesselPosition[] = [];

  for (const pos of positions) {
    if (pos.speed <= PORT_CALL_SPEED_THRESHOLD) {
      if (!stoppedStart) {
        stoppedStart = pos;
        stoppedPositions = [pos];
      } else {
        stoppedPositions.push(pos);
      }
    } else {
      if (stoppedStart && stoppedPositions.length > 0) {
        const lastStopped = stoppedPositions[stoppedPositions.length - 1]!;
        const durationMs =
          new Date(lastStopped.timestamp).getTime() -
          new Date(stoppedStart.timestamp).getTime();
        const durationMin = durationMs / (1000 * 60);

        if (durationMin >= PORT_CALL_MIN_DURATION_MIN) {
          // Calcola posizione media
          const avgLat = stoppedPositions.reduce((s, p) => s + p.lat, 0) / stoppedPositions.length;
          const avgLon = stoppedPositions.reduce((s, p) => s + p.lon, 0) / stoppedPositions.length;

          portCalls.push({
            mmsi,
            port_name: `${avgLat.toFixed(2)}N, ${avgLon.toFixed(2)}E`,
            port_lat: avgLat,
            port_lon: avgLon,
            arrived_at: stoppedStart.timestamp,
            departed_at: lastStopped.timestamp,
            duration_hours: Math.round(durationMin / 60 * 10) / 10,
          });
        }
      }
      stoppedStart = null;
      stoppedPositions = [];
    }
  }

  // Se la nave e ancora ferma
  if (stoppedStart && stoppedPositions.length > 0) {
    const lastStopped = stoppedPositions[stoppedPositions.length - 1]!;
    const durationMs =
      new Date(lastStopped.timestamp).getTime() -
      new Date(stoppedStart.timestamp).getTime();
    const durationMin = durationMs / (1000 * 60);

    if (durationMin >= PORT_CALL_MIN_DURATION_MIN) {
      const avgLat = stoppedPositions.reduce((s, p) => s + p.lat, 0) / stoppedPositions.length;
      const avgLon = stoppedPositions.reduce((s, p) => s + p.lon, 0) / stoppedPositions.length;

      portCalls.push({
        mmsi,
        port_name: `${avgLat.toFixed(2)}N, ${avgLon.toFixed(2)}E`,
        port_lat: avgLat,
        port_lon: avgLon,
        arrived_at: stoppedStart.timestamp,
        departed_at: null,
        duration_hours: Math.round(durationMin / 60 * 10) / 10,
      });
    }
  }

  return portCalls;
}

/** GET /api/vessel/:mmsi/portcalls */
router.get('/:mmsi/portcalls', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = paramsSchema.safeParse(req.params);
    if (!parsed.success) {
      throw new ValidationError('Invalid MMSI');
    }

    const { mmsi } = parsed.data;
    const supabase = getSupabase();

    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    const { data } = await supabase
      .from('vessel_positions')
      .select('*')
      .eq('mmsi', mmsi)
      .gte('timestamp', ninetyDaysAgo)
      .order('timestamp', { ascending: true });

    const positions = (data ?? []) as VesselPosition[];
    const portCalls = reconstructPortCalls(positions, mmsi);

    res.json(portCalls);
  } catch (err) {
    next(err);
  }
});

export default router;

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { getSupabase } from '../services/supabase.js';
import { ValidationError } from '../../shared/errors.js';
import { TRACK_MAX_POINTS, RETENTION_DAYS } from '../../shared/config.js';
import type { VesselPosition } from '../../shared/types.js';

const router = Router();

const paramsSchema = z.object({
  mmsi: z.string().regex(/^[1-9]\d{8}$/),
});

const querySchema = z.object({
  days: z.coerce.number().min(1).max(RETENTION_DAYS).default(30),
});

/**
 * Algoritmo di downsampling adattivo per tracce AIS.
 *
 * Priorità nella selezione dei punti:
 * 1. Sempre primo e ultimo punto
 * 2. Punti con cambi significativi di rotta (> 25°)
 * 3. Punti con cambi significativi di velocità (> 3 kn)
 * 4. Punti con cambi di stato navigazione
 * 5. Punti equidistanti per riempire il budget rimanente
 *
 * Questo approccio preserva la forma geometrica della traccia
 * (soprattutto le svolte) senza richiedere algoritmi costosi come RDP.
 */
function downsampleTrack(positions: VesselPosition[], targetCount: number): VesselPosition[] {
  if (positions.length <= targetCount) return positions;

  const n = positions.length;
  const keepIndices = new Set<number>();

  // Punti obbligatori: primo e ultimo
  keepIndices.add(0);
  keepIndices.add(n - 1);

  // Passa 1: identifica punti significativi
  for (let i = 1; i < n - 1; i++) {
    const prev = positions[i - 1]!;
    const curr = positions[i]!;

    // Cambio di rotta significativo (> 25 gradi, normalizzato su 0-180)
    let courseDelta = Math.abs(curr.course - prev.course);
    if (courseDelta > 180) courseDelta = 360 - courseDelta;
    if (courseDelta > 25) {
      keepIndices.add(i);
      continue;
    }

    // Cambio di velocità significativo (> 3 nodi)
    if (Math.abs(curr.speed - prev.speed) > 3) {
      keepIndices.add(i);
      continue;
    }

    // Cambio di stato navigazione (es. ormeggiata → in moto)
    if (curr.nav_status !== prev.nav_status) {
      keepIndices.add(i);
    }
  }

  // Se i punti significativi superano già il target, li dirado uniformemente
  if (keepIndices.size >= targetCount) {
    const arr = [...keepIndices].sort((a, b) => a - b);
    const step = Math.ceil(arr.length / targetCount);
    const thinned = new Set<number>([0, n - 1]);
    for (let i = 0; i < arr.length; i += step) {
      thinned.add(arr[i]!);
    }
    return [...thinned].sort((a, b) => a - b).map(i => positions[i]!);
  }

  // Passa 2: riempi il budget rimanente con punti equidistanti
  const budget = targetCount - keepIndices.size;
  const candidates: number[] = [];
  for (let i = 1; i < n - 1; i++) {
    if (!keepIndices.has(i)) candidates.push(i);
  }

  if (candidates.length <= budget) {
    // Tutti i candidati entrano nel budget — restituisci tutto
    return positions;
  }

  const step = Math.ceil(candidates.length / budget);
  for (let i = 0; i < candidates.length; i += step) {
    keepIndices.add(candidates[i]!);
  }

  return [...keepIndices].sort((a, b) => a - b).map(i => positions[i]!);
}

/** GET /api/vessel/:mmsi/track?days=30 */
router.get('/:mmsi/track', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const paramsParsed = paramsSchema.safeParse(req.params);
    if (!paramsParsed.success) {
      throw new ValidationError('Invalid MMSI');
    }

    const queryParsed = querySchema.safeParse(req.query);
    if (!queryParsed.success) {
      throw new ValidationError(`days must be 1-${RETENTION_DAYS}`);
    }

    const { mmsi } = paramsParsed.data;
    const { days } = queryParsed.data;
    const supabase = getSupabase();

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    // Nota: fetch fino a TRACK_MAX_POINTS * 5 per avere dati sufficienti per
    // il downsampling. Il vecchio .limit(TRACK_MAX_POINTS) tagliava i dati
    // più recenti restituendo solo i primi N punti (bug).
    const { data, error } = await supabase
      .from('vessel_positions')
      .select('*')
      .eq('mmsi', mmsi)
      .gte('timestamp', since)
      .order('timestamp', { ascending: true })
      .limit(TRACK_MAX_POINTS * 5);

    if (error) {
      throw new ValidationError(error.message);
    }

    const positions = (data ?? []) as VesselPosition[];
    const result = downsampleTrack(positions, TRACK_MAX_POINTS);

    // Header di debug per monitorare il downsampling
    res.setHeader('X-Track-Original-Count', positions.length);
    res.setHeader('X-Track-Returned-Count', result.length);

    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;

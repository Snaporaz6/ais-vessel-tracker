import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { getSupabase } from '../services/supabase.js';
import { ValidationError } from '../../shared/errors.js';
import { TRACK_MAX_POINTS, RETENTION_DAYS } from '../../shared/config.js';

const router = Router();

const paramsSchema = z.object({
  mmsi: z.string().regex(/^[1-9]\d{8}$/),
});

const querySchema = z.object({
  days: z.coerce.number().min(1).max(RETENTION_DAYS).default(30),
});

/** GET /api/vessel/:mmsi/track?days=30 */
router.get('/:mmsi/track', async (req: Request, res: Response) => {
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

  const { data, error } = await supabase
    .from('vessel_positions')
    .select('*')
    .eq('mmsi', mmsi)
    .gte('timestamp', since)
    .order('timestamp', { ascending: true })
    .limit(TRACK_MAX_POINTS);

  if (error) {
    throw new ValidationError(error.message);
  }

  res.json(data ?? []);
});

export default router;

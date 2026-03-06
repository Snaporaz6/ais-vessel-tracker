import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { getSupabase } from '../services/supabase.js';
import { ValidationError } from '../../shared/errors.js';
import { LIVE_MAP_MAX_VESSELS } from '../../shared/config.js';

const router = Router();

const bboxSchema = z.object({
  bbox: z
    .string()
    .transform((s) => s.split(',').map(Number))
    .refine((arr) => arr.length === 4 && arr.every((n) => !isNaN(n)), {
      message: 'bbox must be 4 comma-separated numbers: lat1,lon1,lat2,lon2',
    }),
});

/** GET /api/map/live?bbox=lat1,lon1,lat2,lon2 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = bboxSchema.safeParse(req.query);
    if (!parsed.success) {
      throw new ValidationError('bbox must be 4 comma-separated numbers: lat1,lon1,lat2,lon2');
    }

    const [lat1, lon1, lat2, lon2] = parsed.data.bbox;
    const supabase = getSupabase();

    // Finestra temporale: ultime posizioni recenti (10 minuti)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .rpc('get_live_vessels', {
        min_lat: Math.min(lat1!, lat2!),
        max_lat: Math.max(lat1!, lat2!),
        min_lon: Math.min(lon1!, lon2!),
        max_lon: Math.max(lon1!, lon2!),
        since: tenMinutesAgo,
        max_results: LIVE_MAP_MAX_VESSELS,
      });

    if (error) {
      // Fallback: query base senza RPC
      const { data: fallback } = await supabase
        .from('vessel_positions')
        .select('mmsi, lat, lon, speed, course, timestamp')
        .gte('lat', Math.min(lat1!, lat2!))
        .lte('lat', Math.max(lat1!, lat2!))
        .gte('lon', Math.min(lon1!, lon2!))
        .lte('lon', Math.max(lon1!, lon2!))
        .gte('timestamp', tenMinutesAgo)
        .order('timestamp', { ascending: false })
        .limit(LIVE_MAP_MAX_VESSELS);

      res.json(fallback ?? []);
      return;
    }

    res.json(data ?? []);
  } catch (err) {
    next(err);
  }
});

export default router;

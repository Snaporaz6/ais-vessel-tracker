import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { getSupabase } from '../services/supabase.js';
import { ValidationError } from '../../shared/errors.js';

const router = Router();

const paramsSchema = z.object({
  mmsi: z.string().regex(/^[1-9]\d{8}$/),
});

/** GET /api/vessel/:mmsi/anomalies */
router.get('/:mmsi/anomalies', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = paramsSchema.safeParse(req.params);
    if (!parsed.success) {
      throw new ValidationError('Invalid MMSI');
    }

    const { mmsi } = parsed.data;
    const supabase = getSupabase();

    const { data } = await supabase
      .from('anomaly_events')
      .select('*')
      .eq('mmsi', mmsi)
      .order('detected_at', { ascending: false })
      .limit(100);

    res.json(data ?? []);
  } catch (err) {
    next(err);
  }
});

export default router;

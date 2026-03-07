import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { getSupabase } from '../services/supabase.js';
import { findSanctions } from '../services/sanctions.js';
import { NotFoundError, ValidationError } from '../../shared/errors.js';

const router = Router();

const mmsiSchema = z.string().regex(/^[1-9]\d{8}$/);

/** GET /api/vessel/:mmsi */
router.get('/:mmsi', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = mmsiSchema.safeParse(req.params['mmsi']);
    if (!parsed.success) {
      throw new ValidationError('Invalid MMSI format (must be 9 digits, not starting with 0)');
    }

    const mmsi = parsed.data;
    const supabase = getSupabase();

    // Fetch vessel
    const { data: vessel } = await supabase
      .from('vessels')
      .select('*')
      .eq('mmsi', mmsi)
      .single();

    // Fetch last position
    const { data: positions } = await supabase
      .from('vessel_positions')
      .select('*')
      .eq('mmsi', mmsi)
      .order('timestamp', { ascending: false })
      .limit(1);

    // Se non c'è ne il vessel ne le posizioni, 404
    if (!vessel && (!positions || positions.length === 0)) {
      throw new NotFoundError('Vessel', mmsi);
    }

    // Se manca il record statico ma ci sono posizioni, crea un vessel minimo
    const vesselData = vessel ?? {
      mmsi,
      imo: null,
      name: 'UNKNOWN',
      ship_type: 'other',
      flag: null,
      length: null,
      width: null,
      max_speed: null,
      destination: null,
      eta: null,
      updated_at: positions?.[0]?.timestamp ?? new Date().toISOString(),
    };

    // Fetch sanctions
    const sanctions = await findSanctions(mmsi, vesselData.imo);

    // Fetch anomalies (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: anomalies } = await supabase
      .from('anomaly_events')
      .select('*')
      .eq('mmsi', mmsi)
      .gte('detected_at', thirtyDaysAgo)
      .order('detected_at', { ascending: false });

    res.json({
      ...vesselData,
      last_position: positions?.[0] ?? null,
      sanctions,
      anomalies: anomalies ?? [],
    });
  } catch (err) {
    next(err);
  }
});

export default router;

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { getSupabase } from '../services/supabase.js';
import { ValidationError } from '../../shared/errors.js';

const router = Router();

const searchSchema = z.object({
  q: z.string().min(1).max(100),
});

/** GET /api/search?q={nome|mmsi|imo} */
router.get('/', async (req: Request, res: Response) => {
  const parsed = searchSchema.safeParse(req.query);
  if (!parsed.success) {
    throw new ValidationError('Query parameter "q" is required (1-100 chars)');
  }

  const { q } = parsed.data;
  const supabase = getSupabase();

  // Ricerca esatta per MMSI (9 cifre) o IMO (7 cifre)
  if (/^\d{9}$/.test(q)) {
    const { data } = await supabase.from('vessels').select('*').eq('mmsi', q);
    res.json(data ?? []);
    return;
  }

  if (/^\d{7}$/.test(q)) {
    const { data } = await supabase.from('vessels').select('*').eq('imo', q);
    res.json(data ?? []);
    return;
  }

  // Ricerca fuzzy per nome (pg_trgm)
  const { data } = await supabase
    .from('vessels')
    .select('*')
    .textSearch('name', q, { type: 'websearch' })
    .limit(20);

  // Fallback: ILIKE se textSearch non trova risultati
  if (!data || data.length === 0) {
    const { data: ilike } = await supabase
      .from('vessels')
      .select('*')
      .ilike('name', `%${q}%`)
      .limit(20);
    res.json(ilike ?? []);
    return;
  }

  res.json(data);
});

export default router;

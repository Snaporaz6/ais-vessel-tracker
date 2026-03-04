import { getSupabase } from './supabase.js';
import type { SanctionRecord } from '../../shared/types.js';

/** Cerca sanzioni per MMSI o IMO */
export async function findSanctions(mmsi: string, imo?: string | null): Promise<SanctionRecord[]> {
  const supabase = getSupabase();

  let query = supabase.from('sanctions').select('*');

  if (imo) {
    query = query.or(`mmsi.eq.${mmsi},imo.eq.${imo}`);
  } else {
    query = query.eq('mmsi', mmsi);
  }

  const { data, error } = await query;

  if (error) {
    console.log(JSON.stringify({ event: 'sanctions_query_error', mmsi, error: error.message }));
    return [];
  }

  return (data ?? []) as SanctionRecord[];
}

/** Controlla se un MMSI o IMO e sanzionato */
export async function isSanctioned(mmsi: string, imo?: string | null): Promise<boolean> {
  const sanctions = await findSanctions(mmsi, imo);
  return sanctions.length > 0;
}

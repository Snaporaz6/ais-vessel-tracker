import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { DatabaseError } from '../../shared/errors.js';

let client: SupabaseClient;

/** Restituisce il client Supabase singleton per l'API */
export function getSupabase(): SupabaseClient {
  if (!client) {
    const url = process.env['SUPABASE_URL'];
    const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];
    if (!url || !key) {
      throw new DatabaseError('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    }
    client = createClient(url, key);
  }
  return client;
}

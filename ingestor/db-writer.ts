import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Vessel, VesselPosition } from '../shared/types.js';
import { BATCH_INTERVAL_MS, BATCH_MAX_SIZE } from '../shared/config.js';
import { DatabaseError } from '../shared/errors.js';

let supabase: SupabaseClient;

/** Inizializza il client Supabase */
export function initDB(): void {
  const url = process.env['SUPABASE_URL'];
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!url || !key) {
    throw new DatabaseError('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  supabase = createClient(url, key);
}

// Buffer per batch insert
let positionBuffer: VesselPosition[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

/** Aggiunge una posizione al buffer e fluscia se necessario */
export function bufferPosition(pos: VesselPosition): void {
  positionBuffer.push(pos);
  if (positionBuffer.length >= BATCH_MAX_SIZE) {
    void flushPositions();
  } else if (!flushTimer) {
    flushTimer = setTimeout(() => void flushPositions(), BATCH_INTERVAL_MS);
  }
}

/** Fluscia il buffer posizioni verso Supabase */
async function flushPositions(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  if (positionBuffer.length === 0) return;

  const batch = positionBuffer.splice(0, BATCH_MAX_SIZE);
  const count = batch.length;

  try {
    const { error } = await supabase
      .from('vessel_positions')
      .upsert(batch, { onConflict: 'mmsi,timestamp' });

    if (error) {
      console.log(JSON.stringify({ event: 'db_write_error', error: error.message, count }));
      // Rimetti in testa al buffer per ritentare
      positionBuffer.unshift(...batch);
    } else {
      console.log(JSON.stringify({ event: 'positions_flushed', count }));
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(JSON.stringify({ event: 'db_write_exception', error: message, count }));
    positionBuffer.unshift(...batch);
  }
}

// Flag per evitare di inviare colonne non ancora migrate
let hasDestinationColumn = true;

/** Upsert metadati statici di una nave */
export async function upsertVessel(vessel: Partial<Vessel> & { mmsi: string }): Promise<void> {
  try {
    // Se le colonne destination/eta non esistono ancora, le rimuoviamo dal payload
    const payload: Record<string, unknown> = { ...vessel, updated_at: new Date().toISOString() };
    if (!hasDestinationColumn) {
      delete payload['destination'];
      delete payload['eta'];
    }

    const { error } = await supabase
      .from('vessels')
      .upsert(payload, { onConflict: 'mmsi' });

    if (error) {
      // Se l'errore è "column does not exist", disabilita le colonne e riprova
      if (error.message.includes('destination') || error.message.includes('column') && error.message.includes('does not exist')) {
        if (hasDestinationColumn) {
          hasDestinationColumn = false;
          console.log(JSON.stringify({ event: 'destination_column_missing', hint: 'Run: ALTER TABLE vessels ADD COLUMN IF NOT EXISTS destination TEXT; ALTER TABLE vessels ADD COLUMN IF NOT EXISTS eta TEXT;' }));
          // Riprova senza le colonne
          delete payload['destination'];
          delete payload['eta'];
          const { error: retryError } = await supabase
            .from('vessels')
            .upsert(payload, { onConflict: 'mmsi' });
          if (retryError) {
            console.log(JSON.stringify({ event: 'vessel_upsert_error', mmsi: vessel.mmsi, error: retryError.message }));
          }
          return;
        }
      }
      console.log(JSON.stringify({ event: 'vessel_upsert_error', mmsi: vessel.mmsi, error: error.message }));
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(JSON.stringify({ event: 'vessel_upsert_exception', mmsi: vessel.mmsi, error: message }));
  }
}

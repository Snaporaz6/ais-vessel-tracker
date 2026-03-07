/**
 * Sincronizzazione liste sanzioni OFAC (USA) e EU.
 * Scarica le liste, estrae navi sanzionate, e le inserisce nella tabella `sanctions`.
 *
 * Uso:
 *   npx tsx scripts/sync-sanctions.ts          # Esecuzione singola
 *   npx tsx scripts/sync-sanctions.ts --cron   # Con scheduling ogni 24h
 */
import { config } from 'dotenv';
import { resolve } from 'path';

// Carica .env.local dalla root del progetto
config({ path: resolve(__dirname, '..', '.env.local') });

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { XMLParser } from 'fast-xml-parser';
import { parse as csvParse } from 'csv-parse/sync';
import cron from 'node-cron';

// ====== URLs fonti dati ======
const OFAC_SDN_URL = 'https://www.treasury.gov/ofac/downloads/sdn.xml';
const EU_SANCTIONS_URL = 'https://webgate.ec.europa.eu/fsd/fsf/public/files/csvFullSanctionsList/content?token=dG9rZW4tMjAxNw';

// ====== Supabase ======
const supabaseUrl = process.env['SUPABASE_URL'];
const supabaseKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey);

// ====== Interfacce OFAC XML ======
interface OFACEntry {
  sdnType?: string;
  uid?: string | number;
  lastName?: string;
  firstName?: string;
  programList?: { program?: string | string[] };
  idList?: {
    id?: OFACId | OFACId[];
  };
  vesselInfo?: {
    callSign?: string;
    vesselType?: string;
    vesselFlag?: string;
    tonnage?: string;
    grossRegisteredTonnage?: string;
  };
  remarksText?: string;
}

interface OFACId {
  idType?: string;
  idNumber?: string | number;
}

// ====== Regex per estrarre IMO / MMSI da testo ======
const IMO_REGEX = /\bIMO[:\s#]*(\d{7})\b/i;
const MMSI_REGEX = /\bMMSI[:\s#]*(\d{9})\b/i;

/**
 * Estrae IMO number da un array di ID o da testo libero.
 * OFAC usa idType "Vessel Registration Identification" con idNumber "IMO 7406784".
 */
function extractIMO(ids: OFACId[], ...textFields: (string | undefined)[]): string | null {
  // Cerca nell'ID list (sia idType IMO diretto, sia "Vessel Registration" con "IMO" nel numero)
  for (const id of ids) {
    const idNum = String(id.idNumber ?? '');
    const idType = (id.idType ?? '').toUpperCase();

    // Caso 1: idType contiene "IMO"
    if (idType.includes('IMO')) {
      const clean = idNum.replace(/\D/g, '');
      if (clean.length === 7) return clean;
    }
    // Caso 2: idType è "Vessel Registration Identification" e idNumber contiene "IMO"
    if (idType.includes('VESSEL') || idType.includes('REGISTRATION')) {
      const match = idNum.match(IMO_REGEX);
      if (match) return match[1];
      // Se il numero è solo cifre di 7 caratteri, assume IMO
      const digits = idNum.replace(/\D/g, '');
      if (digits.length === 7) return digits;
    }
  }
  // Fallback: cerca nel testo
  for (const text of textFields) {
    if (text) {
      const match = text.match(IMO_REGEX);
      if (match) return match[1];
    }
  }
  return null;
}

/**
 * Estrae MMSI da un array di ID o da testo libero.
 */
function extractMMSI(ids: OFACId[], ...textFields: (string | undefined)[]): string | null {
  for (const id of ids) {
    const idNum = String(id.idNumber ?? '');
    const idType = (id.idType ?? '').toUpperCase();

    if (idType.includes('MMSI')) {
      const clean = idNum.replace(/\D/g, '');
      if (clean.length === 9 && !clean.startsWith('0')) return clean;
    }
    // Cerca pattern MMSI nel numero
    const mmsiMatch = idNum.match(MMSI_REGEX);
    if (mmsiMatch && !mmsiMatch[1].startsWith('0')) return mmsiMatch[1];
  }
  for (const text of textFields) {
    if (text) {
      const match = text.match(MMSI_REGEX);
      if (match && !match[1].startsWith('0')) return match[1];
    }
  }
  return null;
}

/**
 * Inserisce records in batch (Supabase ha limiti di dimensione payload).
 */
async function batchInsert(
  table: string,
  records: Record<string, unknown>[],
  batchSize = 100
): Promise<{ inserted: number; errors: number }> {
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    const { error } = await supabase.from(table).insert(batch);
    if (error) {
      console.log(JSON.stringify({
        event: 'batch_insert_error',
        table,
        batch_start: i,
        batch_size: batch.length,
        error: error.message,
      }));
      errors += batch.length;
    } else {
      inserted += batch.length;
    }
  }

  return { inserted, errors };
}

// ==========================================
// OFAC SDN List (XML)
// ==========================================

/** Sincronizza sanzioni OFAC (SDN list — navi) */
async function syncOFAC(): Promise<number> {
  console.log(JSON.stringify({ event: 'ofac_sync_start' }));

  const res = await fetch(OFAC_SDN_URL, {
    headers: { 'User-Agent': 'AIS-Vessel-Tracker/1.0' },
  });
  if (!res.ok) throw new Error(`OFAC fetch failed: ${res.status} ${res.statusText}`);

  const xml = await res.text();
  console.log(JSON.stringify({ event: 'ofac_xml_downloaded', size_kb: Math.round(xml.length / 1024) }));

  const parser = new XMLParser({
    ignoreAttributes: true,
    // Forza sdnEntry e id come array per gestione uniforme
    isArray: (name: string) => name === 'sdnEntry' || name === 'id' || name === 'program',
  });
  const parsed = parser.parse(xml);

  const entries: OFACEntry[] = parsed?.sdnList?.sdnEntry ?? [];
  console.log(JSON.stringify({ event: 'ofac_entries_parsed', total: entries.length }));

  // Filtra solo navi
  const vesselEntries = entries.filter((e) => e.sdnType === 'Vessel');
  console.log(JSON.stringify({ event: 'ofac_vessels_found', count: vesselEntries.length }));

  const records = vesselEntries.map((entry) => {
    const ids = entry.idList?.id;
    const idArray = Array.isArray(ids) ? ids : ids ? [ids] : [];
    const remarks = typeof entry.remarksText === 'string' ? entry.remarksText : '';

    const imo = extractIMO(idArray, remarks);
    const mmsi = extractMMSI(idArray, remarks);

    return {
      mmsi,
      imo,
      name: [entry.lastName, entry.firstName].filter(Boolean).join(' ').trim() || 'UNKNOWN',
      source: 'OFAC' as const,
      listed_at: new Date().toISOString(),
      details_json: {
        uid: String(entry.uid ?? ''),
        vessel_info: entry.vesselInfo ?? {},
        programs: entry.programList?.program ?? [],
      },
    };
  });

  if (records.length > 0) {
    // Delete-then-insert atomico: cancella vecchie OFAC e reinserisci
    const { error: delError } = await supabase.from('sanctions').delete().eq('source', 'OFAC');
    if (delError) {
      console.log(JSON.stringify({ event: 'ofac_delete_error', error: delError.message }));
    }

    const { inserted, errors } = await batchInsert('sanctions', records);
    console.log(JSON.stringify({ event: 'ofac_sync_done', vessels: records.length, inserted, errors }));
  } else {
    console.log(JSON.stringify({ event: 'ofac_sync_done', vessels: 0 }));
  }

  return records.length;
}

// ==========================================
// EU Consolidated Sanctions (CSV)
// ==========================================

/** Sincronizza sanzioni EU (Consolidated Financial Sanctions) */
async function syncEU(): Promise<number> {
  console.log(JSON.stringify({ event: 'eu_sync_start' }));

  const res = await fetch(EU_SANCTIONS_URL, {
    headers: { 'User-Agent': 'AIS-Vessel-Tracker/1.0' },
  });
  if (!res.ok) throw new Error(`EU fetch failed: ${res.status} ${res.statusText}`);

  const csvText = await res.text();
  console.log(JSON.stringify({ event: 'eu_csv_downloaded', size_kb: Math.round(csvText.length / 1024) }));

  let rows: Record<string, string>[];
  try {
    rows = csvParse(csvText, {
      columns: true,
      delimiter: ';',           // EU CSV usa ; come separatore
      skip_empty_lines: true,
      relax_column_count: true,
      relax_quotes: true,
      bom: true,
    }) as Record<string, string>[];
  } catch (parseErr) {
    const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
    console.log(JSON.stringify({ event: 'eu_csv_parse_error', error: msg }));
    return 0;
  }

  console.log(JSON.stringify({ event: 'eu_rows_parsed', total: rows.length }));

  // Nomi colonne EU: Subject_type, Entity_remark, Naal_wholename, Programme, etc.
  // Filtra entita marittime: cerca IMO, MMSI, "vessel" nel remark/nome
  const vesselRows = rows.filter((row) => {
    const remark = (row['Entity_remark'] ?? '').toUpperCase();
    const name = (row['Naal_wholename'] ?? '').toUpperCase();
    const subjectType = (row['Subject_type'] ?? '').toUpperCase();

    return (
      remark.includes('IMO') ||
      remark.includes('MMSI') ||
      remark.includes('VESSEL') ||
      remark.includes('SHIP') ||
      remark.includes('TANKER') ||
      remark.includes('CARGO') ||
      remark.includes('FLAG') ||
      name.includes('VESSEL') ||
      (subjectType === 'E' && (remark.includes('TONNAGE') || remark.includes('DEADWEIGHT')))
    );
  });

  console.log(JSON.stringify({ event: 'eu_vessels_found', count: vesselRows.length }));

  // Deduplica per entity_id + nome (EU CSV ha righe duplicate per alias/lingue)
  const seen = new Set<string>();
  const records = vesselRows
    .filter((row) => {
      const key = (row['Entity_logical_id'] ?? '') + '|' + (row['Naal_wholename'] ?? 'UNKNOWN');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((row) => {
      const remark = row['Entity_remark'] ?? '';

      // Estrai IMO e MMSI dal campo remark
      const imoMatch = remark.match(IMO_REGEX);
      const mmsiMatch = remark.match(MMSI_REGEX);

      return {
        mmsi: mmsiMatch ? mmsiMatch[1] : null,
        imo: imoMatch ? imoMatch[1] : null,
        name: row['Naal_wholename'] || row['Naal_lastname'] || 'UNKNOWN',
        source: 'EU' as const,
        listed_at: row['Leba_publication_date'] || new Date().toISOString(),
        details_json: {
          entity_id: row['EU_ref_num'] ?? null,
          subject_type: row['Subject_type'] ?? null,
          remark: remark || null,
          programme: row['Programme'] ?? null,
        },
      };
    });

  if (records.length > 0) {
    const { error: delError } = await supabase.from('sanctions').delete().eq('source', 'EU');
    if (delError) {
      console.log(JSON.stringify({ event: 'eu_delete_error', error: delError.message }));
    }

    const { inserted, errors } = await batchInsert('sanctions', records);
    console.log(JSON.stringify({ event: 'eu_sync_done', entities: records.length, inserted, errors }));
  } else {
    console.log(JSON.stringify({ event: 'eu_sync_done', entities: 0 }));
  }

  return records.length;
}

// ==========================================
// Main + Cron
// ==========================================

/** Esegue la sincronizzazione completa */
async function runSync(): Promise<void> {
  console.log(JSON.stringify({ event: 'sanctions_sync_start', timestamp: new Date().toISOString() }));

  const [ofacCount, euCount] = await Promise.all([
    syncOFAC().catch((err) => {
      console.log(JSON.stringify({ event: 'ofac_sync_error', error: String(err) }));
      return 0;
    }),
    syncEU().catch((err) => {
      console.log(JSON.stringify({ event: 'eu_sync_error', error: String(err) }));
      return 0;
    }),
  ]);

  console.log(JSON.stringify({
    event: 'sanctions_sync_complete',
    ofac_vessels: ofacCount,
    eu_entities: euCount,
    total: ofacCount + euCount,
    timestamp: new Date().toISOString(),
  }));
}

/** Entry point */
async function main(): Promise<void> {
  const isCron = process.argv.includes('--cron');

  // Esegui subito la prima sync
  try {
    await runSync();
  } catch (err) {
    console.log(JSON.stringify({ event: 'sanctions_sync_fatal', error: String(err) }));
    if (!isCron) process.exit(1);
  }

  if (isCron) {
    // Schedula ogni giorno alle 03:00 UTC
    console.log(JSON.stringify({ event: 'cron_scheduled', schedule: '0 3 * * *' }));
    cron.schedule('0 3 * * *', () => {
      void runSync();
    });
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { XMLParser } from 'fast-xml-parser';
import { parse as csvParse } from 'csv-parse/sync';

const OFAC_SDN_URL = 'https://www.treasury.gov/ofac/downloads/sdn.xml';
const EU_SANCTIONS_URL = 'https://webgate.ec.europa.eu/fsd/fsf/public/files/csvFullSanctionsList/content?token=dG9rZW4tMjAxNw';

const supabase = createClient(
  process.env['SUPABASE_URL']!,
  process.env['SUPABASE_SERVICE_ROLE_KEY']!
);

interface OFACEntry {
  sdnType?: string;
  uid?: string;
  lastName?: string;
  firstName?: string;
  programList?: { program?: string | string[] };
  idList?: {
    id?: Array<{
      idType?: string;
      idNumber?: string;
    }> | {
      idType?: string;
      idNumber?: string;
    };
  };
  vesselInfo?: {
    callSign?: string;
    vesselType?: string;
    vesselFlag?: string;
    tonnage?: string;
    grossRegisteredTonnage?: string;
  };
}

/** Sincronizza sanzioni OFAC (SDN list) */
async function syncOFAC(): Promise<number> {
  console.log(JSON.stringify({ event: 'ofac_sync_start' }));

  const res = await fetch(OFAC_SDN_URL);
  if (!res.ok) throw new Error(`OFAC fetch failed: ${res.status}`);

  const xml = await res.text();
  const parser = new XMLParser({ ignoreAttributes: false, isArray: () => false });
  const parsed = parser.parse(xml);

  const entries: OFACEntry[] = parsed?.sdnList?.sdnEntry ?? [];
  const vesselEntries = (Array.isArray(entries) ? entries : [entries])
    .filter((e) => e.sdnType === 'Vessel');

  const records = vesselEntries.map((entry) => {
    let imo: string | null = null;
    const ids = entry.idList?.id;
    const idArray = Array.isArray(ids) ? ids : ids ? [ids] : [];
    for (const id of idArray) {
      if (id.idType === 'IMO') {
        imo = id.idNumber ?? null;
      }
    }

    return {
      mmsi: null,
      imo,
      name: [entry.lastName, entry.firstName].filter(Boolean).join(' ').trim() || 'UNKNOWN',
      source: 'OFAC' as const,
      listed_at: new Date().toISOString(),
      details_json: {
        uid: entry.uid,
        vessel_info: entry.vesselInfo,
      },
    };
  });

  if (records.length > 0) {
    // Cancella vecchie OFAC e reinserisci
    await supabase.from('sanctions').delete().eq('source', 'OFAC');
    const { error } = await supabase.from('sanctions').insert(records);
    if (error) {
      console.log(JSON.stringify({ event: 'ofac_insert_error', error: error.message }));
    }
  }

  console.log(JSON.stringify({ event: 'ofac_sync_done', vessels: records.length }));
  return records.length;
}

/** Sincronizza sanzioni EU */
async function syncEU(): Promise<number> {
  console.log(JSON.stringify({ event: 'eu_sync_start' }));

  const res = await fetch(EU_SANCTIONS_URL);
  if (!res.ok) throw new Error(`EU fetch failed: ${res.status}`);

  const csvText = await res.text();
  const rows = csvParse(csvText, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  }) as Record<string, string>[];

  // Filtra solo entita di tipo "vessel" / "entity" con dati marittimi
  const vesselRows = rows.filter((row) => {
    const nameAlias = (row['nameAlias_wholeName'] || '').toUpperCase();
    const subjectType = (row['entity_subjectType'] || '').toLowerCase();
    return subjectType.includes('enterprise') || nameAlias.includes('VESSEL') || row['entity_remark']?.includes('IMO');
  });

  const records = vesselRows.slice(0, 500).map((row) => ({
    mmsi: null,
    imo: null,
    name: row['nameAlias_wholeName'] || 'UNKNOWN',
    source: 'EU' as const,
    listed_at: row['regulation_publicationDate'] || new Date().toISOString(),
    details_json: {
      entity_id: row['entity_euReferenceNumber'],
      remark: row['entity_remark'],
    },
  }));

  if (records.length > 0) {
    await supabase.from('sanctions').delete().eq('source', 'EU');
    const { error } = await supabase.from('sanctions').insert(records);
    if (error) {
      console.log(JSON.stringify({ event: 'eu_insert_error', error: error.message }));
    }
  }

  console.log(JSON.stringify({ event: 'eu_sync_done', entities: records.length }));
  return records.length;
}

/** Main: esegui sync entrambe le liste */
async function main() {
  console.log(JSON.stringify({ event: 'sanctions_sync_start' }));

  try {
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

    console.log(JSON.stringify({ event: 'sanctions_sync_complete', ofac: ofacCount, eu: euCount }));
  } catch (err) {
    console.log(JSON.stringify({ event: 'sanctions_sync_fatal', error: String(err) }));
    process.exit(1);
  }
}

main();

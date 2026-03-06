/**
 * Inserisce dati demo nel database per testare l'intera pipeline.
 * Navi nel Mediterraneo con posizioni, anomalie e sanzioni.
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env['SUPABASE_URL']!,
  process.env['SUPABASE_SERVICE_ROLE_KEY']!
);

const DEMO_VESSELS = [
  { mmsi: '247320200', imo: '9398022', name: 'GRANDE EUROPA', ship_type: 'cargo', flag: 'IT', length: 210, width: 32, max_speed: 20 },
  { mmsi: '636092179', imo: '9450313', name: 'MAERSK SELETAR', ship_type: 'cargo', flag: 'LR', length: 300, width: 48, max_speed: 22 },
  { mmsi: '240234000', imo: '9372458', name: 'BLUE STAR PATMOS', ship_type: 'passenger', flag: 'GR', length: 145, width: 22, max_speed: 28 },
  { mmsi: '538006773', imo: '9690131', name: 'HAFNIA PHOENIX', ship_type: 'tanker', flag: 'MH', length: 183, width: 32, max_speed: 15 },
  { mmsi: '227005700', imo: '8707270', name: 'JEAN NICOLI', ship_type: 'passenger', flag: 'FR', length: 155, width: 25, max_speed: 24 },
  { mmsi: '356789012', imo: '9234567', name: 'PACIFIC MARINER', ship_type: 'cargo', flag: 'PA', length: 190, width: 30, max_speed: 18 },
  { mmsi: '211234567', imo: '9345678', name: 'HAMBURG STAR', ship_type: 'cargo', flag: 'DE', length: 175, width: 28, max_speed: 19 },
  { mmsi: '538901234', imo: '9456789', name: 'OCEAN LIBERTY', ship_type: 'tanker', flag: 'MH', length: 250, width: 44, max_speed: 16 },
  { mmsi: '341567890', imo: '9567890', name: 'NEPTUNE FISHER', ship_type: 'fishing', flag: 'ES', length: 35, width: 9, max_speed: 12 },
  { mmsi: '247111222', imo: '9678901', name: 'PUGLIA EXPRESS', ship_type: 'tug', flag: 'IT', length: 30, width: 10, max_speed: 14 },
  { mmsi: '224567890', imo: '9789012', name: 'VALENCIA BELLE', ship_type: 'pleasure', flag: 'ES', length: 22, width: 6, max_speed: 20 },
  { mmsi: '256123456', imo: '9890123', name: 'MALTA GUARDIAN', ship_type: 'military', flag: 'MT', length: 80, width: 12, max_speed: 30 },
];

/** Posizioni demo: rotte realistiche nel Mediterraneo */
const ROUTES: Record<string, Array<{ lat: number; lon: number; speed: number; course: number }>> = {
  '247320200': [ // GRANDE EUROPA: Genova -> Napoli
    { lat: 44.40, lon: 8.93, speed: 0.3, course: 180 },
    { lat: 43.80, lon: 9.20, speed: 16.5, course: 165 },
    { lat: 43.10, lon: 9.80, speed: 17.2, course: 155 },
    { lat: 42.30, lon: 10.50, speed: 18.0, course: 150 },
    { lat: 41.50, lon: 11.80, speed: 17.8, course: 140 },
    { lat: 40.85, lon: 14.25, speed: 0.2, course: 0 },
  ],
  '636092179': [ // MAERSK SELETAR: Suez -> Gibilterra
    { lat: 31.26, lon: 32.31, speed: 0.4, course: 270 },
    { lat: 32.50, lon: 28.00, speed: 19.5, course: 290 },
    { lat: 33.80, lon: 22.00, speed: 20.1, course: 280 },
    { lat: 35.50, lon: 15.00, speed: 19.8, course: 275 },
    { lat: 36.20, lon: 8.00, speed: 20.0, course: 265 },
    { lat: 36.00, lon: 1.00, speed: 19.5, course: 260 },
  ],
  '240234000': [ // BLUE STAR PATMOS: Pireo -> Cicladi
    { lat: 37.94, lon: 23.64, speed: 0.1, course: 180 },
    { lat: 37.60, lon: 24.10, speed: 22.0, course: 150 },
    { lat: 37.30, lon: 24.50, speed: 24.0, course: 140 },
    { lat: 37.00, lon: 25.10, speed: 23.5, course: 130 },
    { lat: 36.80, lon: 25.40, speed: 8.0, course: 120 },
    { lat: 36.75, lon: 25.43, speed: 0.2, course: 0 },
  ],
  '538006773': [ // HAFNIA PHOENIX: largo Libia
    { lat: 33.50, lon: 14.00, speed: 13.0, course: 90 },
    { lat: 33.30, lon: 16.00, speed: 13.5, course: 88 },
    { lat: 33.10, lon: 18.00, speed: 12.8, course: 85 },
    { lat: 33.00, lon: 20.00, speed: 13.2, course: 82 },
    { lat: 32.80, lon: 22.50, speed: 14.0, course: 80 },
    { lat: 32.50, lon: 25.00, speed: 13.0, course: 78 },
  ],
  '227005700': [ // JEAN NICOLI: Marsiglia -> Corsica
    { lat: 43.29, lon: 5.37, speed: 0.1, course: 130 },
    { lat: 42.90, lon: 6.00, speed: 20.5, course: 135 },
    { lat: 42.50, lon: 7.50, speed: 22.0, course: 120 },
    { lat: 42.10, lon: 8.90, speed: 21.5, course: 110 },
    { lat: 41.92, lon: 8.73, speed: 3.0, course: 100 },
    { lat: 41.93, lon: 8.74, speed: 0.1, course: 0 },
  ],
};

async function seed() {
  console.log('Seeding demo vessels...');

  // Upsert vessels
  const { error: vErr } = await supabase.from('vessels').upsert(
    DEMO_VESSELS.map((v) => ({ ...v, updated_at: new Date().toISOString() })),
    { onConflict: 'mmsi' }
  );
  if (vErr) { console.error('Vessels error:', vErr.message); return; }
  console.log(`Inserted ${DEMO_VESSELS.length} vessels`);

  // Insert positions (track over last 2 hours)
  const now = Date.now();
  const positions: Array<Record<string, unknown>> = [];

  for (const [mmsi, route] of Object.entries(ROUTES)) {
    for (let i = 0; i < route.length; i++) {
      const p = route[i]!;
      const ts = new Date(now - (route.length - 1 - i) * 20 * 60 * 1000); // 20 min apart
      positions.push({
        mmsi,
        timestamp: ts.toISOString(),
        lat: p.lat,
        lon: p.lon,
        speed: p.speed,
        course: p.course,
        heading: p.course,
        nav_status: p.speed < 1 ? 'moored' : 'underway_engine',
      });
    }
  }

  // Also add current positions for vessels without routes
  for (const v of DEMO_VESSELS) {
    if (!ROUTES[v.mmsi]) {
      const randomLat = 35 + Math.random() * 8;
      const randomLon = 5 + Math.random() * 20;
      positions.push({
        mmsi: v.mmsi,
        timestamp: new Date(now - 60000).toISOString(),
        lat: randomLat,
        lon: randomLon,
        speed: 5 + Math.random() * 15,
        course: Math.random() * 360,
        heading: Math.random() * 360,
        nav_status: 'underway_engine',
      });
      positions.push({
        mmsi: v.mmsi,
        timestamp: new Date(now).toISOString(),
        lat: randomLat + 0.01,
        lon: randomLon + 0.02,
        speed: 5 + Math.random() * 15,
        course: Math.random() * 360,
        heading: Math.random() * 360,
        nav_status: 'underway_engine',
      });
    }
  }

  const { error: pErr } = await supabase.from('vessel_positions').upsert(positions, { onConflict: 'mmsi,timestamp' });
  if (pErr) { console.error('Positions error:', pErr.message); return; }
  console.log(`Inserted ${positions.length} positions`);

  // Insert demo anomalies
  const anomalies = [
    { mmsi: '538006773', type: 'dark_activity', detected_at: new Date(now - 3600000).toISOString(), details: { gap_hours: 8.5, last_lat: 33.0, last_lon: 18.0 } },
    { mmsi: '356789012', type: 'speed_anomaly', detected_at: new Date(now - 7200000).toISOString(), details: { implied_speed_knots: 35.2, max_expected: 27, distance_nm: 42 } },
    { mmsi: '636092179', type: 'dark_activity', detected_at: new Date(now - 86400000).toISOString(), details: { gap_hours: 12.3, last_lat: 34.0, last_lon: 20.0 } },
  ];

  const { error: aErr } = await supabase.from('anomaly_events').insert(anomalies);
  if (aErr) { console.error('Anomalies error:', aErr.message); return; }
  console.log(`Inserted ${anomalies.length} anomalies`);

  // Insert demo sanction
  const sanctions = [
    { mmsi: '538006773', imo: '9690131', name: 'HAFNIA PHOENIX', source: 'OFAC', listed_at: new Date().toISOString(), details_json: { reason: 'Demo sanction entry' } },
  ];

  const { error: sErr } = await supabase.from('sanctions').insert(sanctions);
  if (sErr) { console.error('Sanctions error:', sErr.message); return; }
  console.log(`Inserted ${sanctions.length} sanctions`);

  console.log('Demo seed complete!');
}

seed();

/** Configurazione centralizzata — tutti i valori soglia del progetto */

/** Intervallo batching scritture DB (ms) */
export const BATCH_INTERVAL_MS = 500;

/** Max posizioni per batch */
export const BATCH_MAX_SIZE = 200;

/** Gap AIS minimo per flag dark activity (ore) */
export const DARK_ACTIVITY_GAP_HOURS = 6;

/** Sotto questa latitudine = zona polare, no flag dark activity */
export const DARK_ACTIVITY_MIN_LAT = -60;

/** Sopra questa latitudine = zona polare, no flag dark activity */
export const DARK_ACTIVITY_MAX_LAT = 60;

/** Velocita implicita > max_speed * questo = anomalia */
export const SPEED_ANOMALY_MULTIPLIER = 1.5;

/** Knots: sotto questa velocita la nave e "ferma" */
export const PORT_CALL_SPEED_THRESHOLD = 1.0;

/** Minuti minimi ferma per contare come port call */
export const PORT_CALL_MIN_DURATION_MIN = 30;

/** Distanza max dalla costa per considerare un porto (km) */
export const PORT_CALL_MAX_COAST_DIST_KM = 5.0;

/** Max navi restituite per richiesta /map/live */
export const LIVE_MAP_MAX_VESSELS = 5000;

/** Richieste max per minuto per IP */
export const RATE_LIMIT_RPM = 60;

/** Giorni di retention dati posizioni */
export const RETENTION_DAYS = 90;

/** Intervallo minimo tra posizioni dello stesso MMSI (secondi) */
export const DEDUP_INTERVAL_SEC = 2;

/** Bounding box Mediterraneo allargato [latMin, lonMin, latMax, lonMax] */
export const MEDITERRANEAN_BBOX = {
  latMin: 30.0,
  lonMin: -6.0,
  latMax: 46.0,
  lonMax: 36.5,
} as const;

/** Max punti track prima di downsampling */
export const TRACK_MAX_POINTS = 5000;

/** Delta lat/lon per ricerca prossimita porto (~5km a latitudini mediterranee) */
export const PORT_PROXIMITY_DELTA = 0.05;

/** Max visite recenti restituite per /api/port/:name */
export const PORT_MAX_RECENT_VISITS = 50;

/** Porta API di default */
export const API_PORT = 3001;

/** Time-series archive intervals (seconds), independent of live ingestion. */
export const HISTORY_TIERS = [
  { maxAgeDays: 2, intervalSeconds: 60 },
  { maxAgeDays: 7, intervalSeconds: 300 },
  { maxAgeDays: 30, intervalSeconds: 1800 },
  { maxAgeDays: 90, intervalSeconds: 7200 },
] as const;
export const ARCHIVE_INTERVAL_MS = 60 * 60 * 1000;
export const LIVE_TTL_MS = 10 * 60 * 1000;
export const SOURCE_STALE_MS = 2 * 60 * 1000;
export const TRACK_GAP_MS = 30 * 60 * 1000;
export const STOP_RADIUS_METERS = 500;
export const ANOMALY_COOLDOWN_MS = 30 * 60 * 1000;
export const SANCTIONS_STALE_MS = 48 * 60 * 60 * 1000;
export const API_CACHE_MS = 5 * 60 * 1000;
export const ARCHIVE_CACHE_BYTES = 64 * 1024 * 1024;
export const MONTHLY_BUDGET_EUR = 30;
export const RELEASE_COST_GATE_EUR = 25;
export const SPOOL_LIMIT_BYTES = 4 * 1024 * 1024 * 1024;

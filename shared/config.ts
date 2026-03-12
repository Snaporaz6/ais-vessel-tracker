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
export const LIVE_MAP_MAX_VESSELS = 500;

/** Richieste max per minuto per IP */
export const RATE_LIMIT_RPM = 60;

/** Giorni di retention dati posizioni */
export const RETENTION_DAYS = 90;

/** Intervallo minimo tra posizioni dello stesso MMSI (secondi) */
export const DEDUP_INTERVAL_SEC = 30;

/** Bounding box Mediterraneo allargato [latMin, lonMin, latMax, lonMax] */
export const MEDITERRANEAN_BBOX = {
  latMin: 30.0,
  lonMin: -6.0,
  latMax: 46.0,
  lonMax: 36.5,
} as const;

/** Max punti track prima di downsampling */
export const TRACK_MAX_POINTS = 5000;

/** Delta lat/lon per considerare posizioni nello stesso porto (~5km a latitudini mediterranee) */
export const PORT_PROXIMITY_DELTA = 0.05;

/** Porta API di default */
export const API_PORT = 3001;

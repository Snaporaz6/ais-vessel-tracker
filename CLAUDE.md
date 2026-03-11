# CLAUDE.md — AIS Vessel Tracker

## Panoramica del progetto
Alternativa gratuita a MarineTraffic e VesselFinder con storico posizioni gratuito fino a 90 giorni.
Obiettivo: tracking navi in tempo reale, schede nave con storico traccia, rilevamento anomalie AIS, check sanzioni OFAC/EU.

---

## Stack tecnico

| Layer | Tool | Note |
|---|---|---|
| AIS live | aisstream.io WebSocket | Streaming globale gratuito |
| Backend | Node.js + Express | Deploy su Railway |
| Database | Supabase (PostgreSQL + TimescaleDB) | Hypertable per posizioni |
| Cache | Supabase Realtime o Redis | Posizioni live |
| Frontend | Next.js (App Router) | Deploy su Vercel |
| Mappa tiles | MapLibre GL JS (v5+) | WebGL, proiezione globo 3D nativa |
| Sanzioni | OFAC XML + EU CSV | Cron giornaliero |

---

## Dipendenze npm esplicite

### Backend (ingestor + API)
```
ws                      # WebSocket client per aisstream.io
@supabase/supabase-js   # Client Supabase
express                 # REST API
cors                    # CORS middleware
helmet                  # Security headers
express-rate-limit      # Rate limiting 60 req/min
dotenv                  # Variabili d'ambiente
zod                     # Validazione input/schema
node-cron               # Scheduling sync sanzioni
fast-xml-parser         # Parsing OFAC XML
csv-parse               # Parsing EU CSV
geolib                  # Calcolo distanze geodetiche (port call, anomalie)
```

### Frontend
```
next                    # Framework React SSR
react / react-dom       # UI
maplibre-gl             # Mappa WebGL con proiezione globo 3D nativa (usato imperativamente)
@supabase/supabase-js   # Client Supabase (query dirette dove serve)
swr                     # Data fetching + cache client-side
```

> **Nota:** Leaflet + react-leaflet + leaflet.markercluster sono stati rimossi in favore di MapLibre GL, che offre rendering GPU-accelerato, proiezione globo nativa, e clustering GeoJSON integrato.

### Dev
```
typescript              # Compilatore TS
@types/express @types/ws  # Type definitions
tsx                     # Esecuzione diretta .ts in dev
eslint                  # Linting
```

**Regola: non aggiungere librerie non elencate qui senza motivo esplicito. Se serve una nuova dipendenza, documentarla prima in questo file.**

---

## Struttura directory

```
ais-tracker/
├── CLAUDE.md                  # Questo file
├── .env.local                 # Credenziali (MAI committare)
├── tsconfig.json              # Config TS condivisa
├── shared/
│   └── types.ts               # Interfacce TypeScript condivise (vedi sotto)
├── ingestor/
│   ├── index.ts               # Entry point ingestor
│   ├── ws-client.ts           # WebSocket aisstream.io
│   ├── parser.ts              # Parsing messaggi AIS
│   ├── filter.ts              # Filtro geografico + validazione
│   ├── db-writer.ts           # Upsert batch su Supabase
│   └── anomaly-detector.ts    # Rilevamento anomalie
├── api/
│   ├── index.ts               # Entry point API
│   ├── routes/
│   │   ├── vessel.ts          # GET /vessel/:mmsi
│   │   ├── track.ts           # GET /vessel/:mmsi/track
│   │   ├── search.ts          # GET /search?q=
│   │   ├── live.ts            # GET /map/live?bbox=
│   │   └── portcalls.ts       # GET /vessel/:mmsi/portcalls
│   └── services/
│       ├── supabase.ts        # Client Supabase condiviso
│       └── sanctions.ts       # Query sanzioni OFAC/EU
├── frontend/
│   ├── app/
│   │   ├── page.tsx           # Homepage mappa full-screen
│   │   ├── vessel/[mmsi]/page.tsx  # Scheda nave (SSR)
│   │   └── port/[name]/page.tsx    # Pagina porto (SSR)
│   └── components/
│       ├── Map.tsx              # Mappa MapLibre GL imperativa (globo + mercator)
│       ├── VesselDrawer.tsx
│       ├── VesselFilter.tsx     # Filtro tipo nave con checkboxes
│       ├── AnomalyBadge.tsx
│       ├── SanctionBadge.tsx
│       └── SearchBar.tsx
└── scripts/
    ├── init-db.sql            # Schema TimescaleDB
    └── sync-sanctions.ts      # Cron aggiornamento sanzioni
```

---

## Tipi TypeScript condivisi (`shared/types.ts`)

Tutte le interfacce principali del progetto. Ogni modulo importa da qui — **non ridefinire questi tipi altrove**.

```typescript
/** Metadati statici di una nave */
export interface Vessel {
  mmsi: string;             // 9 cifre, PK
  imo: string | null;       // 7 cifre, può essere assente
  name: string;
  ship_type: ShipType;
  flag: string;             // ISO 3166-1 alpha-2
  length: number | null;    // metri
  width: number | null;     // metri
  max_speed: number | null; // knots (da dati statici o calcolata)
  updated_at: string;       // ISO 8601
}

/** Posizione AIS di una nave in un dato istante */
export interface VesselPosition {
  mmsi: string;
  lat: number;
  lon: number;
  speed: number;            // knots (SOG)
  course: number;           // gradi (COG)
  heading: number;          // gradi (true heading)
  nav_status: NavStatus;
  timestamp: string;        // ISO 8601
}

/** Port call ricostruito dal track */
export interface PortCall {
  mmsi: string;
  port_name: string;
  port_lat: number;
  port_lon: number;
  arrived_at: string;       // ISO 8601
  departed_at: string | null;
  duration_hours: number;
}

/** Flag anomalia rilevata */
export interface AnomalyEvent {
  mmsi: string;
  type: AnomalyType;
  detected_at: string;      // ISO 8601
  details: Record<string, unknown>;
}

/** Record sanzione */
export interface SanctionRecord {
  mmsi: string | null;
  imo: string | null;
  name: string;
  source: 'OFAC' | 'EU';
  listed_at: string;        // ISO 8601
  details_json: Record<string, unknown>;
}

/** Risposta API /map/live */
export interface LiveMapVessel {
  mmsi: string;
  name: string;
  ship_type: ShipType;
  lat: number;
  lon: number;
  speed: number;
  course: number;
  is_sanctioned: boolean;
  anomaly_flags: AnomalyType[];
}

export type ShipType =
  | 'cargo'
  | 'tanker'
  | 'passenger'
  | 'fishing'
  | 'tug'
  | 'pleasure'
  | 'military'
  | 'other';

export type NavStatus =
  | 'underway_engine'
  | 'at_anchor'
  | 'not_under_command'
  | 'moored'
  | 'aground'
  | 'fishing'
  | 'underway_sailing'
  | 'unknown';

export type AnomalyType =
  | 'dark_activity'         // gap AIS > 6h in zona non polare
  | 'speed_anomaly'         // velocità implicita > 1.5x max tipo nave
  | 'impossible_movement'   // teletrasporto geografico impossibile
  | 'ais_spoofing';         // posizioni incoerenti (V2)
```

---

## Schema database — SQL di riferimento

Questo è lo schema esatto che `scripts/init-db.sql` deve generare.

```sql
-- Abilitare TimescaleDB
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ===========================================
-- VESSELS: metadati statici
-- ===========================================
CREATE TABLE vessels (
    mmsi        VARCHAR(9) PRIMARY KEY,
    imo         VARCHAR(7),
    name        TEXT NOT NULL DEFAULT 'UNKNOWN',
    ship_type   TEXT NOT NULL DEFAULT 'other',
    flag        VARCHAR(2),
    length      SMALLINT,
    width       SMALLINT,
    max_speed   REAL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_vessels_imo ON vessels(imo) WHERE imo IS NOT NULL;
CREATE INDEX idx_vessels_name ON vessels USING gin(name gin_trgm_ops);
-- Richiede: CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ===========================================
-- VESSEL_POSITIONS: timeseries (hypertable)
-- ===========================================
CREATE TABLE vessel_positions (
    mmsi        VARCHAR(9) NOT NULL,
    timestamp   TIMESTAMPTZ NOT NULL,
    lat         DOUBLE PRECISION NOT NULL,
    lon         DOUBLE PRECISION NOT NULL,
    speed       REAL,
    course      REAL,
    heading     REAL,
    nav_status  TEXT,
    PRIMARY KEY (mmsi, timestamp)
);

SELECT create_hypertable('vessel_positions', 'timestamp');

-- Retention policy: elimina dati > 90 giorni
SELECT add_retention_policy('vessel_positions', INTERVAL '90 days');

-- Indici per query frequenti
CREATE INDEX idx_positions_mmsi_time ON vessel_positions (mmsi, timestamp DESC);
CREATE INDEX idx_positions_time ON vessel_positions (timestamp DESC);

-- ===========================================
-- SANCTIONS: lista navi sanzionate
-- ===========================================
CREATE TABLE sanctions (
    id          SERIAL PRIMARY KEY,
    mmsi        VARCHAR(9),
    imo         VARCHAR(7),
    name        TEXT NOT NULL,
    source      TEXT NOT NULL CHECK (source IN ('OFAC', 'EU')),
    listed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    details_json JSONB DEFAULT '{}'
);

CREATE INDEX idx_sanctions_mmsi ON sanctions(mmsi) WHERE mmsi IS NOT NULL;
CREATE INDEX idx_sanctions_imo ON sanctions(imo) WHERE imo IS NOT NULL;

-- ===========================================
-- ANOMALY_EVENTS: log anomalie rilevate
-- ===========================================
CREATE TABLE anomaly_events (
    id          SERIAL PRIMARY KEY,
    mmsi        VARCHAR(9) NOT NULL,
    type        TEXT NOT NULL,
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    details     JSONB DEFAULT '{}'
);

CREATE INDEX idx_anomalies_mmsi ON anomaly_events(mmsi, detected_at DESC);
```

---

## Parametri configurabili

Valori soglia per anomaly detection e port call. Definirli come costanti in un file `shared/config.ts`, **non hardcodarli nei singoli moduli**.

| Parametro | Valore MVP | Descrizione |
|---|---|---|
| `BATCH_INTERVAL_MS` | 500 | Intervallo batching scritture DB |
| `BATCH_MAX_SIZE` | 200 | Max posizioni per batch |
| `DARK_ACTIVITY_GAP_HOURS` | 6 | Gap AIS minimo per flag dark activity |
| `DARK_ACTIVITY_MIN_LAT` | -60 | Sotto questa latitudine = zona polare, no flag |
| `DARK_ACTIVITY_MAX_LAT` | 60 | Sopra questa latitudine = zona polare, no flag |
| `SPEED_ANOMALY_MULTIPLIER` | 1.5 | Velocità implicita > max_speed × questo = anomalia |
| `PORT_CALL_SPEED_THRESHOLD` | 1.0 | Knots: sotto questa velocità la nave è "ferma" |
| `PORT_CALL_MIN_DURATION_MIN` | 30 | Minuti minimi ferma per contare come port call |
| `PORT_CALL_MAX_COAST_DIST_KM` | 5.0 | Distanza max dalla costa per considerare un porto |
| `LIVE_MAP_MAX_VESSELS` | 500 | Max navi restituite per richiesta /map/live |
| `RATE_LIMIT_RPM` | 60 | Richieste max per minuto per IP |
| `RETENTION_DAYS` | 90 | Giorni di retention dati posizioni |

---

## Filtro ingestor — Regole per l'MVP

L'ingestor riceve traffico AIS globale. Senza filtro, Supabase free si satura in ore. Regole di filtering obbligatorie per l'MVP:

1. **Filtro geografico**: accettare solo posizioni nel **Mediterraneo allargato** (bounding box):
   - Lat: 30.0°N — 46.0°N
   - Lon: 6.0°W — 36.5°E
   - Nota: aisstream.io supporta il filtro bbox lato server nel messaggio di subscribe

2. **Filtro validità**: scartare messaggi dove:
   - `mmsi` non è 9 cifre o inizia con 0
   - `lat` o `lon` sono 0 o fuori range (-90/90 e -180/180)
   - `speed` è negativo o > 100 knots

3. **Deduplicazione temporale**: non salvare una nuova posizione se per lo stesso MMSI l'ultima posizione salvata è < 30 secondi fa (riduce volume ~70%)

4. **Solo messaggi utili**: processare solo `PositionReport` (tipo 1,2,3) e `ShipStaticData` (tipo 5). Ignorare tutti gli altri tipi di messaggio AIS.

---

## API Endpoints

```
GET /api/search?q={nome|mmsi|imo}
    → Risposta: Vessel[]
    → Ricerca fuzzy per nome (pg_trgm), esatta per mmsi/imo

GET /api/vessel/:mmsi
    → Risposta: Vessel & { last_position: VesselPosition, sanctions: SanctionRecord[], anomalies: AnomalyEvent[] }

GET /api/vessel/:mmsi/track?days=30
    → Risposta: VesselPosition[]
    → Default 30 giorni, max 90. Downsampling se > 5000 punti.

GET /api/vessel/:mmsi/portcalls
    → Risposta: PortCall[]

GET /api/vessel/:mmsi/anomalies
    → Risposta: AnomalyEvent[]

GET /api/map/live?bbox=lat1,lon1,lat2,lon2
    → Risposta: LiveMapVessel[]
    → Max 500 risultati, solo ultima posizione per nave
```

---

## Regole di sviluppo

1. **TypeScript ovunque** — niente `.js` puri nel codebase. `strict: true` nel tsconfig.
2. **Tipi condivisi** — importare sempre da `shared/types.ts`. Non ridefinire interfacce localmente.
3. **JSDoc obbligatorio** su tutte le funzioni esportate.
4. **No credenziali nel codice** — usare sempre `.env.local`. Mai loggare valori di env.
5. **Batching DB** — le scritture su Supabase vanno raggruppate secondo `BATCH_INTERVAL_MS` e `BATCH_MAX_SIZE`.
6. **SSR per SEO** — le pagine `/vessel/:mmsi` e `/port/:name` devono essere Server Side Rendered.
7. **Error handling esplicito** — niente `any` nei catch. Definire classi di errore custom in `shared/errors.ts`.
8. **Rate limiting** — l'API pubblica va limitata con `express-rate-limit` a `RATE_LIMIT_RPM` per IP.
9. **Costanti centralizzate** — tutti i valori soglia in `shared/config.ts`, mai hardcodati nei moduli.
10. **Logging strutturato** — usare `console.log(JSON.stringify({ event, mmsi, ... }))` per facile parsing su Railway.

---

## Variabili d'ambiente richieste

```
# AIS Source
AISSTREAM_API_KEY=

# Supabase (backend)
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# Supabase (frontend — sicure da esporre)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# API
API_PORT=3001
API_BASE_URL=http://localhost:3001

# Opzionale: override filtro geografico
INGESTOR_BBOX=30.0,-6.0,46.0,36.5
```

---

## Ordine di sviluppo consigliato

Ogni step è una sessione Claude Code autonoma. Completare uno step prima di passare al successivo.

1. **Schema DB** — Eseguire `init-db.sql` su Supabase. Verificare hypertable e retention policy.
2. **Tipi condivisi** — Creare `shared/types.ts`, `shared/config.ts`, `shared/errors.ts`.
3. **Ingestor WebSocket** — `ws-client.ts` + `parser.ts` + `filter.ts` + `db-writer.ts`. Testare con log prima di scrivere su DB.
4. **Anomaly detector** — `anomaly-detector.ts`. Testare con dati finti prima di collegare al flusso live.
5. **REST API** — Tutti e 6 gli endpoints. Testare con curl/httpie.
6. **Frontend mappa** — MapLibre GL full-screen + clustering GeoJSON + VesselDrawer al click + filtro tipo nave + toggle globo 3D.
7. **SSR schede nave/porto** — Pagine `/vessel/[mmsi]` e `/port/[name]` con metadati SEO.
8. **Cron sanzioni** — `sync-sanctions.ts` con parsing OFAC XML e EU CSV.
9. **Badge anomalie e sanzioni** — Componenti `AnomalyBadge` e `SanctionBadge` nel frontend.

---

## Fonti dati

- **AIS live**: [aisstream.io](https://aisstream.io) — WebSocket gratuito, supporta filtro bbox lato server
- **Sanzioni OFAC**: https://ofac.treasury.gov/specially-designated-nationals-list-data-formats-data-schemas
- **Sanzioni EU**: https://data.europa.eu/data/datasets/consolidated-list-of-persons-groups-and-entities-subject-to-eu-financial-sanctions
- **Dati statici navi**: Estratti dai messaggi AIS tipo 5 (ShipStaticData) — non serve fonte esterna per l'MVP

---

## Note architetturali

- Il **bounding box** della mappa live va downsampled: restituire max 500 navi per richiesta, ultima posizione soltanto.
- I **port call** vengono ricostruiti dal track: porto rilevato quando speed < `PORT_CALL_SPEED_THRESHOLD` per > `PORT_CALL_MIN_DURATION_MIN` entro `PORT_CALL_MAX_COAST_DIST_KM` dalla costa.
- Il **dark activity** viene flaggato quando gap AIS > `DARK_ACTIVITY_GAP_HOURS` in zona non polare (lat tra `DARK_ACTIVITY_MIN_LAT` e `DARK_ACTIVITY_MAX_LAT`).
- La **speed anomaly** viene flaggata quando la velocità implicita tra due punti supera `SPEED_ANOMALY_MULTIPLIER` × la velocità massima del tipo di nave.
- La **deduplicazione** nell'ingestor è il primo meccanismo di controllo costi su Supabase.
- **MapLibre GL usato imperativamente** — NON usare `react-map-gl`: la v8 è incompatibile con MapLibre v5 globe projection (`getRayDirectionFromPixel` not implemented). Creare la mappa con `new maplibregl.Map()` in useEffect, aggiornare dati via `source.setData()`.
- **Globe toggle** — `map.setProjection({ type: 'globe' | 'mercator' })`. Basemap: CARTO dark-matter vector tiles (`https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json`).
- **Clustering** — GeoJSON source con `cluster: true` (nativo MapLibre), rimpiazza leaflet.markercluster.
- **Dopo swap dipendenze** — eliminare `.next/` cache (`rm -rf frontend/.next`) prima di riavviare il dev server per evitare errori su moduli rimossi.

---

## Roadmap post-MVP

Funzionalità da considerare dopo che l'MVP è stabile e online:

- **Espansione geografica**: rimuovere il filtro Mediterraneo, aggiungere bbox per Golfo Persico, Southeast Asia, Nord Europa
- **AISHub.net come fonte secondaria**: data sharing cooperativo, utile come fallback se aisstream.io ha downtime
- **AIS spoofing detection**: analisi pattern geometrici (movimento a cerchio, box) — richiede storico di almeno 24h
- **Container tracking**: correlazione nave ↔ container via dati IMO
- **Alert system**: notifiche email/webhook quando una nave monitorata entra in porto, viene sanzionata, o genera anomalia
- **ETA prediction**: stima arrivo basata su rotta storica + velocità media + meteo
- **API pubblica con chiave**: rate limit più alto per utenti registrati, monetizzazione futura

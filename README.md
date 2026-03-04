# AIS Vessel Tracker

Real-time vessel tracking application powered by AIS data. A free, open-source alternative to MarineTraffic and VesselFinder with 90-day position history, anomaly detection, and sanctions screening.

![Stack](https://img.shields.io/badge/Node.js-Express-green) ![Stack](https://img.shields.io/badge/Next.js-React-blue) ![Stack](https://img.shields.io/badge/Supabase-TimescaleDB-purple) ![Stack](https://img.shields.io/badge/Leaflet-OpenStreetMap-orange)

---

## Features

- **Live Map** — Real-time vessel positions on a dark-themed Leaflet map (Mediterranean focus for MVP)
- **Vessel Search** — Fuzzy search by name, exact lookup by MMSI or IMO number
- **Position History** — Up to 90 days of track data with polyline visualization
- **Anomaly Detection** — Automatic flagging of:
  - Dark activity (AIS gaps > 6 hours in non-polar zones)
  - Speed anomalies (implied speed > 1.5x vessel type max)
  - Impossible movements (teleportation > 1000 nm in < 1 hour)
- **Sanctions Screening** — Cross-reference against OFAC SDN and EU consolidated sanctions lists
- **Port Call Reconstruction** — Automatic detection of port stops from position data
- **SSR Vessel Pages** — SEO-optimized vessel detail pages with full history

---

## Architecture

```
aisstream.io (WebSocket)
       |
   [Ingestor]  ── parse ── filter ── batch write ── anomaly detect
       |
   [Supabase]  (PostgreSQL + TimescaleDB hypertable)
       |
   [Express API]  ── 6 REST endpoints + rate limiting
       |
   [Next.js Frontend]  ── Leaflet map + SSR pages
```

| Layer | Technology | Purpose |
|---|---|---|
| AIS Source | aisstream.io WebSocket | Global AIS streaming (free) |
| Backend | Node.js + Express | REST API + ingestor |
| Database | Supabase (PostgreSQL + TimescaleDB) | Hypertable for positions, 90-day retention |
| Frontend | Next.js (App Router) | SSR pages + interactive map |
| Map | Leaflet + CartoDB Dark tiles | Vessel visualization |
| Sanctions | OFAC XML + EU CSV | Daily sync via cron |

---

## Project Structure

```
├── shared/                  # Shared TypeScript types, config, errors
│   ├── types.ts             # All interfaces (Vessel, Position, Anomaly, etc.)
│   ├── config.ts            # Centralized constants and thresholds
│   └── errors.ts            # Custom error classes
├── ingestor/                # AIS data ingestion pipeline
│   ├── index.ts             # Entry point
│   ├── ws-client.ts         # WebSocket client for aisstream.io
│   ├── parser.ts            # AIS message parser (type 1,2,3,5)
│   ├── filter.ts            # Geographic filter + validation + dedup
│   ├── db-writer.ts         # Batch upsert to Supabase
│   └── anomaly-detector.ts  # Real-time anomaly detection
├── api/                     # Express REST API
│   ├── index.ts             # Entry point with middleware
│   ├── routes/              # Route handlers
│   │   ├── search.ts        # GET /api/search?q=
│   │   ├── vessel.ts        # GET /api/vessel/:mmsi
│   │   ├── track.ts         # GET /api/vessel/:mmsi/track
│   │   ├── live.ts          # GET /api/map/live?bbox=
│   │   ├── portcalls.ts     # GET /api/vessel/:mmsi/portcalls
│   │   └── anomalies.ts     # GET /api/vessel/:mmsi/anomalies
│   └── services/            # Business logic
│       ├── supabase.ts      # Supabase client singleton
│       └── sanctions.ts     # Sanctions query service
├── frontend/                # Next.js application
│   ├── app/                 # App Router pages
│   │   ├── page.tsx         # Homepage (full-screen map)
│   │   ├── vessel/[mmsi]/   # Vessel detail page (SSR)
│   │   └── port/[name]/     # Port page (SSR)
│   └── components/          # React components
│       ├── Map.tsx           # Leaflet map with live markers
│       ├── SearchBar.tsx     # Fuzzy search with dropdown
│       ├── VesselDrawer.tsx  # Side panel with vessel details
│       ├── TrackPolyline.tsx # Track visualization
│       ├── AnomalyBadge.tsx  # Anomaly type badge
│       └── SanctionBadge.tsx # Sanction source badge
└── scripts/
    ├── init-db.sql          # Database schema (TimescaleDB)
    └── sync-sanctions.ts    # OFAC + EU sanctions sync
```

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/search?q={query}` | Search vessels by name (fuzzy), MMSI, or IMO |
| `GET` | `/api/vessel/:mmsi` | Vessel details + last position + sanctions + anomalies |
| `GET` | `/api/vessel/:mmsi/track?days=30` | Position history (default 30 days, max 90) |
| `GET` | `/api/vessel/:mmsi/portcalls` | Reconstructed port calls from track data |
| `GET` | `/api/vessel/:mmsi/anomalies` | Anomaly events for a vessel |
| `GET` | `/api/map/live?bbox=lat1,lon1,lat2,lon2` | Live vessel positions within bounding box (max 500) |
| `GET` | `/api/health` | Health check |

---

## Quick Start

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project (free tier works)
- An [aisstream.io](https://aisstream.io) API key (free)

### 1. Clone and install

```bash
git clone https://github.com/Snaporaz6/ais-vessel-tracker.git
cd ais-vessel-tracker
npm install
cd frontend && npm install && cd ..
```

### 2. Set up the database

Open your Supabase SQL Editor and run the contents of `scripts/init-db.sql`. This creates:
- `vessels` table (static metadata)
- `vessel_positions` hypertable (time-series positions with 90-day retention)
- `sanctions` table (OFAC + EU entries)
- `anomaly_events` table (detected anomalies)
- `get_live_vessels` RPC function (optimized map query)

### 3. Configure environment

```bash
cp .env.example .env.local
```

Fill in your credentials:

```env
AISSTREAM_API_KEY=your_key_here
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

### 4. Start services

```bash
# Terminal 1: AIS Ingestor
npx tsx ingestor/index.ts

# Terminal 2: API Server
npx tsx api/index.ts

# Terminal 3: Frontend
cd frontend && npm run dev
```

### 5. Open the app

Navigate to `http://localhost:3000` to see the live map.

---

## Configuration

All thresholds are centralized in `shared/config.ts`:

| Parameter | Default | Description |
|---|---|---|
| `BATCH_INTERVAL_MS` | 500 | DB write batching interval |
| `BATCH_MAX_SIZE` | 200 | Max positions per batch |
| `DARK_ACTIVITY_GAP_HOURS` | 6 | AIS gap threshold for dark activity flag |
| `SPEED_ANOMALY_MULTIPLIER` | 1.5 | Speed anomaly detection multiplier |
| `PORT_CALL_SPEED_THRESHOLD` | 1.0 kn | Speed below which a vessel is "stopped" |
| `PORT_CALL_MIN_DURATION_MIN` | 30 | Minimum stop duration for port call |
| `LIVE_MAP_MAX_VESSELS` | 500 | Max vessels per map request |
| `RATE_LIMIT_RPM` | 60 | API rate limit per IP |
| `RETENTION_DAYS` | 90 | Position data retention |

---

## Deployment

- **Backend (Ingestor + API)**: Deploy to [Railway](https://railway.app)
- **Frontend**: Deploy to [Vercel](https://vercel.com)
- **Database**: [Supabase](https://supabase.com) (managed PostgreSQL + TimescaleDB)

---

## License

MIT

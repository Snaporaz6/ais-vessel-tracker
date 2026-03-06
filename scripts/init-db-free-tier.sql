-- =============================================
-- AIS Vessel Tracker — Database Schema
-- Supabase FREE TIER (no TimescaleDB)
-- =============================================

-- Estensione per ricerca fuzzy per nome
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ===========================================
-- VESSELS: metadati statici
-- ===========================================
CREATE TABLE IF NOT EXISTS vessels (
    mmsi        VARCHAR(9) PRIMARY KEY,
    imo         VARCHAR(7),
    name        TEXT NOT NULL DEFAULT 'UNKNOWN',
    ship_type   TEXT NOT NULL DEFAULT 'other',
    flag        VARCHAR(2),
    length      SMALLINT,
    width       SMALLINT,
    max_speed   REAL,
    destination TEXT,
    eta         TEXT,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vessels_imo ON vessels(imo) WHERE imo IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vessels_name ON vessels USING gin(name gin_trgm_ops);

-- ===========================================
-- VESSEL_POSITIONS: posizioni AIS
-- ===========================================
CREATE TABLE IF NOT EXISTS vessel_positions (
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

-- Indici per query frequenti
CREATE INDEX IF NOT EXISTS idx_positions_mmsi_time ON vessel_positions (mmsi, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_positions_time ON vessel_positions (timestamp DESC);

-- ===========================================
-- SANCTIONS: lista navi sanzionate
-- ===========================================
CREATE TABLE IF NOT EXISTS sanctions (
    id          SERIAL PRIMARY KEY,
    mmsi        VARCHAR(9),
    imo         VARCHAR(7),
    name        TEXT NOT NULL,
    source      TEXT NOT NULL CHECK (source IN ('OFAC', 'EU')),
    listed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    details_json JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_sanctions_mmsi ON sanctions(mmsi) WHERE mmsi IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sanctions_imo ON sanctions(imo) WHERE imo IS NOT NULL;

-- ===========================================
-- ANOMALY_EVENTS: log anomalie rilevate
-- ===========================================
CREATE TABLE IF NOT EXISTS anomaly_events (
    id          SERIAL PRIMARY KEY,
    mmsi        VARCHAR(9) NOT NULL,
    type        TEXT NOT NULL,
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    details     JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_anomalies_mmsi ON anomaly_events(mmsi, detected_at DESC);

-- ===========================================
-- RPC: get_live_vessels per la mappa live
-- ===========================================
CREATE OR REPLACE FUNCTION get_live_vessels(
    min_lat DOUBLE PRECISION,
    max_lat DOUBLE PRECISION,
    min_lon DOUBLE PRECISION,
    max_lon DOUBLE PRECISION,
    since TIMESTAMPTZ,
    max_results INTEGER DEFAULT 500
)
RETURNS TABLE (
    mmsi VARCHAR(9),
    name TEXT,
    ship_type TEXT,
    lat DOUBLE PRECISION,
    lon DOUBLE PRECISION,
    speed REAL,
    course REAL,
    is_sanctioned BOOLEAN,
    last_seen TIMESTAMPTZ
)
LANGUAGE sql STABLE
AS $$
    SELECT DISTINCT ON (vp.mmsi)
        vp.mmsi,
        COALESCE(v.name, 'UNKNOWN') AS name,
        COALESCE(v.ship_type, 'other') AS ship_type,
        vp.lat,
        vp.lon,
        vp.speed,
        vp.course,
        EXISTS(SELECT 1 FROM sanctions s WHERE s.mmsi = vp.mmsi OR s.imo = v.imo) AS is_sanctioned,
        vp."timestamp" AS last_seen
    FROM vessel_positions vp
    LEFT JOIN vessels v ON v.mmsi = vp.mmsi
    WHERE vp.timestamp >= since
      AND vp.lat BETWEEN min_lat AND max_lat
      AND vp.lon BETWEEN min_lon AND max_lon
    ORDER BY vp.mmsi, vp.timestamp DESC
    LIMIT max_results;
$$;

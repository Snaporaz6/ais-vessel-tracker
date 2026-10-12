-- New installation only. Existing projects: verified backup, then migrations 002 and 003.
BEGIN;
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

-- ADDITIVE. Backup and verify the existing database BEFORE execution.
-- New installations: first run init-db-free-tier.sql. No TimescaleDB.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
ALTER TABLE vessels ADD COLUMN IF NOT EXISTS destination TEXT;
ALTER TABLE vessels ADD COLUMN IF NOT EXISTS eta TEXT;
ALTER TABLE anomaly_events ADD COLUMN IF NOT EXISTS event_key UUID;
CREATE UNIQUE INDEX IF NOT EXISTS anomaly_event_key_idx ON anomaly_events(event_key);
CREATE TABLE IF NOT EXISTS track_archives (
 mmsi VARCHAR(9) NOT NULL, day DATE NOT NULL, object_key TEXT NOT NULL, checksum VARCHAR(64) NOT NULL,
 point_count INTEGER NOT NULL CHECK(point_count>0), compressed_bytes INTEGER NOT NULL CHECK(compressed_bytes>0),
 first_at TIMESTAMPTZ NOT NULL, last_at TIMESTAMPTZ NOT NULL, interval_seconds INTEGER NOT NULL,
 updated_at TIMESTAMPTZ NOT NULL, last_position JSONB NOT NULL, PRIMARY KEY(mmsi,day), CHECK(first_at<=last_at)
);
CREATE INDEX IF NOT EXISTS archives_day_idx ON track_archives(day);
CREATE TABLE IF NOT EXISTS detected_stops (
 id TEXT PRIMARY KEY, mmsi VARCHAR(9) NOT NULL, port_name TEXT NOT NULL,
 port_lat DOUBLE PRECISION NOT NULL, port_lon DOUBLE PRECISION NOT NULL,
 arrived_at TIMESTAMPTZ NOT NULL, departed_at TIMESTAMPTZ, duration_hours DOUBLE PRECISION NOT NULL,
 last_seen_at TIMESTAMPTZ NOT NULL, uncertain_departure BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS stops_mmsi_time_idx ON detected_stops(mmsi,arrived_at DESC);
CREATE INDEX IF NOT EXISTS stops_location_idx ON detected_stops(port_lat,port_lon);
CREATE TABLE IF NOT EXISTS import_states (
 source TEXT PRIMARY KEY CHECK(source IN ('OFAC','EU')), updated_at TIMESTAMPTZ,
 attempted_at TIMESTAMPTZ NOT NULL, last_error TEXT, record_count INTEGER NOT NULL DEFAULT 0
);
CREATE OR REPLACE FUNCTION search_vessels_beta(query_text TEXT)
RETURNS SETOF vessels LANGUAGE sql STABLE SET search_path=public,extensions AS $$
 SELECT v.* FROM vessels v WHERE CASE WHEN query_text ~ '^[0-9]+$'
 THEN v.mmsi=query_text OR v.imo=query_text ELSE
 lower(v.name) % lower(query_text) OR lower(v.name) LIKE '%'||replace(replace(replace(lower(query_text),'\','\\'),'%','\%'),'_','\_')||'%' END
 ORDER BY CASE WHEN v.mmsi=query_text OR v.imo=query_text THEN 0 ELSE 1 END,
 similarity(lower(v.name),lower(query_text)) DESC,v.mmsi LIMIT 20;
$$;
CREATE OR REPLACE FUNCTION replace_sanctions_beta(source_name TEXT,records JSONB,checked_at TIMESTAMPTZ)
RETURNS INTEGER LANGUAGE plpgsql SET search_path=public AS $$
DECLARE old_count INTEGER; new_count INTEGER;
BEGIN
 IF source_name NOT IN ('OFAC','EU') OR jsonb_typeof(records)<>'array' OR jsonb_array_length(records)=0 THEN RAISE EXCEPTION 'INVALID_SANCTIONS_IMPORT'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('sanctions:'||source_name));
 CREATE TEMP TABLE IF NOT EXISTS sanctions_stage_beta
 (mmsi VARCHAR(9),imo VARCHAR(7),name TEXT,source TEXT,listed_at TIMESTAMPTZ,details_json JSONB) ON COMMIT DROP;
 TRUNCATE sanctions_stage_beta;
 INSERT INTO sanctions_stage_beta SELECT x.mmsi,x.imo,x.name,x.source,x.listed_at,x.details_json
 FROM jsonb_to_recordset(records) AS x(mmsi TEXT,imo TEXT,name TEXT,source TEXT,listed_at TIMESTAMPTZ,details_json JSONB);
 SELECT count(*) INTO new_count FROM sanctions_stage_beta;
 SELECT count(*) INTO old_count FROM sanctions WHERE source=source_name;
 IF new_count<old_count*0.7 OR EXISTS(SELECT 1 FROM sanctions_stage_beta WHERE
 source IS DISTINCT FROM source_name OR name IS NULL OR btrim(name)='' OR listed_at IS NULL OR
 (mmsi IS NOT NULL AND mmsi !~ '^[1-9][0-9]{8}$') OR (imo IS NOT NULL AND imo !~ '^[0-9]{7}$'))
 THEN RAISE EXCEPTION 'INVALID_SANCTIONS_IMPORT'; END IF;
 DELETE FROM sanctions WHERE source=source_name;
 INSERT INTO sanctions(mmsi,imo,name,source,listed_at,details_json) SELECT * FROM sanctions_stage_beta;
 INSERT INTO import_states(source,updated_at,attempted_at,last_error,record_count) VALUES(source_name,checked_at,checked_at,NULL,new_count)
 ON CONFLICT(source) DO UPDATE SET updated_at=EXCLUDED.updated_at,attempted_at=EXCLUDED.attempted_at,last_error=NULL,record_count=EXCLUDED.record_count;
 RETURN new_count;
END;
$$;
CREATE OR REPLACE FUNCTION fail_sanctions_beta(source_name TEXT,checked_at TIMESTAMPTZ)
RETURNS VOID LANGUAGE sql SET search_path=public AS $$
 INSERT INTO import_states(source,attempted_at,last_error,record_count) VALUES(source_name,checked_at,'IMPORT_FAILED',0)
 ON CONFLICT(source) DO UPDATE SET attempted_at=EXCLUDED.attempted_at,last_error='IMPORT_FAILED';
$$;
CREATE OR REPLACE FUNCTION prune_metadata_beta(before_time TIMESTAMPTZ)
RETURNS VOID LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 DELETE FROM anomaly_events WHERE detected_at<before_time;
 DELETE FROM detected_stops WHERE arrived_at<before_time AND (departed_at IS NOT NULL OR last_seen_at<before_time);
END;
$$;
DO $$ DECLARE t TEXT; BEGIN
 FOREACH t IN ARRAY ARRAY['vessels','vessel_positions','sanctions','anomaly_events','track_archives','detected_stops','import_states'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon,authenticated',t);
 EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role',t);
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION storage_metrics_beta() RETURNS JSONB LANGUAGE sql STABLE SET search_path=public AS $$
 SELECT jsonb_build_object('database_bytes',pg_database_size(current_database()),'metadata_bytes',
 (SELECT sum(pg_total_relation_size(t::regclass)) FROM unnest(ARRAY['vessels','anomaly_events','sanctions','track_archives','detected_stops','import_states'])t),
 'archive_bytes',coalesce(sum(compressed_bytes),0),'archive_objects',count(*),'first_observation_at',min(first_at),'last_observation_at',max(last_at)) FROM track_archives;
$$;
REVOKE ALL ON FUNCTION storage_metrics_beta() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION storage_metrics_beta() TO service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon,authenticated;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
REVOKE ALL ON FUNCTION search_vessels_beta(TEXT),replace_sanctions_beta(TEXT,JSONB,TIMESTAMPTZ),fail_sanctions_beta(TEXT,TIMESTAMPTZ),prune_metadata_beta(TIMESTAMPTZ) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION search_vessels_beta(TEXT),replace_sanctions_beta(TEXT,JSONB,TIMESTAMPTZ),fail_sanctions_beta(TEXT,TIMESTAMPTZ),prune_metadata_beta(TIMESTAMPTZ) TO service_role;
REVOKE ALL ON FUNCTION get_live_vessels(DOUBLE PRECISION,DOUBLE PRECISION,DOUBLE PRECISION,DOUBLE PRECISION,TIMESTAMPTZ,INTEGER) FROM PUBLIC,anon,authenticated;
-- Query località limitata nel database, sulle stesse soste rilevate dall'acquisitore.
CREATE INDEX IF NOT EXISTS detected_stops_location_idx ON detected_stops(port_lat,port_lon,arrived_at DESC);
CREATE OR REPLACE FUNCTION nearby_stops_beta(query_lat DOUBLE PRECISION,query_lon DOUBLE PRECISION,max_rows INTEGER DEFAULT 51)
RETURNS SETOF detected_stops LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
  SELECT s.* FROM detected_stops s
  WHERE s.arrived_at >= now()-interval '90 days'
    AND abs(s.port_lat-query_lat)<=0.0046
    AND least(abs(s.port_lon-query_lon),360-abs(s.port_lon-query_lon))<=0.0046/greatest(abs(cos(radians(query_lat))),0.000001)
    AND 6378137*acos(greatest(-1.0,least(1.0,
      sin(radians(s.port_lat))*sin(radians(query_lat))+
      cos(radians(s.port_lat))*cos(radians(query_lat))*cos(radians(s.port_lon-query_lon)))))<=500
  ORDER BY s.arrived_at DESC,s.id
  LIMIT greatest(1,least(coalesce(max_rows,51),51));
$$;
REVOKE ALL ON FUNCTION nearby_stops_beta(DOUBLE PRECISION,DOUBLE PRECISION,INTEGER) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION nearby_stops_beta(DOUBLE PRECISION,DOUBLE PRECISION,INTEGER) TO service_role;

COMMIT;

-- Compact metadata and guarded legacy archive helpers.
-- Additive migration. Apply only after a verified backup.
-- Additive migration. Apply only after a verified backup.
-- Additive migration. Apply only after a verified backup.
BEGIN;
CREATE TABLE IF NOT EXISTS metadata_groups (
 kind TEXT NOT NULL CHECK(kind IN ('track_archives','detected_stops')),
 mmsi VARCHAR(9) NOT NULL, month DATE NOT NULL,
 version INTEGER NOT NULL CHECK(version=1), payload BYTEA NOT NULL,
 checksum TEXT NOT NULL CHECK(checksum ~ '^[a-f0-9]{64}$'),
 archive_bytes BIGINT NOT NULL DEFAULT 0 CHECK(archive_bytes>=0),
 archive_sizes JSONB NOT NULL DEFAULT '{}'::jsonb,
 row_count INTEGER NOT NULL CHECK(row_count>0 AND row_count<=20000),
 first_at TIMESTAMPTZ NOT NULL, last_at TIMESTAMPTZ NOT NULL,
 max_arrived_at TIMESTAMPTZ, min_lat DOUBLE PRECISION, max_lat DOUBLE PRECISION,
 min_lon DOUBLE PRECISION, max_lon DOUBLE PRECISION,
 area BOX GENERATED ALWAYS AS (CASE WHEN min_lat IS NOT NULL THEN box(point(min_lon,min_lat),point(max_lon,max_lat)) END) STORED,
 PRIMARY KEY(kind,mmsi,month), CHECK(first_at<=last_at),
 CHECK(octet_length(payload)<=4194304), CHECK(extract(day FROM month)=1)
);
ALTER TABLE metadata_groups ADD COLUMN IF NOT EXISTS archive_sizes JSONB NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS metadata_groups_period_idx ON metadata_groups(kind,month);
CREATE INDEX IF NOT EXISTS metadata_groups_area_idx ON metadata_groups USING gist(area) WHERE kind='detected_stops';
ALTER TABLE metadata_groups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON metadata_groups FROM anon,authenticated;
GRANT ALL ON metadata_groups TO service_role;
CREATE TABLE IF NOT EXISTS metadata_compaction_state(id BOOLEAN PRIMARY KEY CHECK(id),revision BIGINT NOT NULL DEFAULT 0);
INSERT INTO metadata_compaction_state(id) VALUES(true) ON CONFLICT DO NOTHING;
ALTER TABLE metadata_compaction_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON metadata_compaction_state FROM anon,authenticated;
GRANT ALL ON metadata_compaction_state TO service_role;
CREATE TABLE IF NOT EXISTS metadata_vessel_revisions(mmsi TEXT PRIMARY KEY,revision BIGINT NOT NULL DEFAULT 0);
ALTER TABLE metadata_vessel_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON metadata_vessel_revisions FROM PUBLIC,anon,authenticated;
GRANT ALL ON metadata_vessel_revisions TO service_role;
CREATE OR REPLACE FUNCTION metadata_vessel_revision_beta(vessel_mmsi TEXT) RETURNS BIGINT LANGUAGE sql STABLE SET search_path=public AS $$ SELECT coalesce((SELECT revision FROM metadata_vessel_revisions WHERE mmsi=vessel_mmsi),0); $$;
REVOKE ALL ON FUNCTION metadata_vessel_revision_beta(TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION metadata_vessel_revision_beta(TEXT) TO service_role;
CREATE OR REPLACE FUNCTION metadata_revision_beta() RETURNS BIGINT LANGUAGE sql STABLE SET search_path=public AS $$ SELECT revision FROM metadata_compaction_state WHERE id; $$;
REVOKE ALL ON FUNCTION metadata_revision_beta() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION metadata_revision_beta() TO service_role;
CREATE OR REPLACE FUNCTION apply_metadata_group_beta(g JSONB, previous_checksum TEXT, expected_rows JSONB)
RETURNS BOOLEAN LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE old_hash TEXT; matches INTEGER; expected INTEGER; body BYTEA;
BEGIN
 IF g->>'kind' NOT IN ('track_archives','detected_stops') OR g->>'mmsi' !~ '^[1-9][0-9]{8}$' OR jsonb_typeof(expected_rows)<>'array' THEN RAISE EXCEPTION 'METADATA_GROUP_INVALID'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext((g->>'kind')||':'||(g->>'mmsi')||':'||(g->>'month')));
 SELECT checksum INTO old_hash FROM metadata_groups WHERE kind=g->>'kind' AND mmsi=g->>'mmsi' AND month=(g->>'month')::date FOR UPDATE;
 IF old_hash IS DISTINCT FROM previous_checksum THEN RETURN false; END IF;
 expected:=jsonb_array_length(expected_rows);
 IF g->>'kind'='track_archives' THEN
  PERFORM 1 FROM track_archives t JOIN jsonb_populate_recordset(NULL::track_archives,expected_rows) x USING(mmsi,day) FOR UPDATE OF t;
  SELECT count(*) INTO matches FROM track_archives t JOIN jsonb_populate_recordset(NULL::track_archives,expected_rows) x USING(mmsi,day) WHERE t IS NOT DISTINCT FROM x;
 ELSE
  PERFORM 1 FROM detected_stops t JOIN jsonb_populate_recordset(NULL::detected_stops,expected_rows) x USING(id) FOR UPDATE OF t;
  SELECT count(*) INTO matches FROM detected_stops t JOIN jsonb_populate_recordset(NULL::detected_stops,expected_rows) x USING(id) WHERE t IS NOT DISTINCT FROM x;
 END IF;
 IF matches<>expected THEN RETURN false; END IF;
 IF (g->>'row_count')::int=0 THEN
  IF expected<>0 THEN RAISE EXCEPTION 'METADATA_EMPTY_WITH_ROWS'; END IF;
  DELETE FROM metadata_groups WHERE kind=g->>'kind' AND mmsi=g->>'mmsi' AND month=(g->>'month')::date;
 ELSE
  body:=decode(g->>'payload_hex','hex');
  IF encode(sha256(body),'hex')<>g->>'checksum' THEN RAISE EXCEPTION 'METADATA_CHECKSUM_INVALID'; END IF;
  INSERT INTO metadata_groups(kind,mmsi,month,version,payload,checksum,row_count,archive_bytes,archive_sizes,first_at,last_at,max_arrived_at,min_lat,max_lat,min_lon,max_lon)
  VALUES(g->>'kind',g->>'mmsi',(g->>'month')::date,1,body,g->>'checksum',(g->>'row_count')::int,coalesce((g->>'archive_bytes')::bigint,0),coalesce(g->'archive_sizes','{}'::jsonb),(g->>'first_at')::timestamptz,(g->>'last_at')::timestamptz,(g->>'max_arrived_at')::timestamptz,(g->>'min_lat')::float8,(g->>'max_lat')::float8,(g->>'min_lon')::float8,(g->>'max_lon')::float8)
  ON CONFLICT(kind,mmsi,month) DO UPDATE SET payload=EXCLUDED.payload,checksum=EXCLUDED.checksum,row_count=EXCLUDED.row_count,archive_bytes=EXCLUDED.archive_bytes,archive_sizes=EXCLUDED.archive_sizes,first_at=EXCLUDED.first_at,last_at=EXCLUDED.last_at,max_arrived_at=EXCLUDED.max_arrived_at,min_lat=EXCLUDED.min_lat,max_lat=EXCLUDED.max_lat,min_lon=EXCLUDED.min_lon,max_lon=EXCLUDED.max_lon;
  IF g->>'kind'='track_archives' THEN
   DELETE FROM track_archives t USING jsonb_populate_recordset(NULL::track_archives,expected_rows) x WHERE t.mmsi=x.mmsi AND t.day=x.day;
  ELSE
   DELETE FROM detected_stops t USING jsonb_populate_recordset(NULL::detected_stops,expected_rows) x WHERE t.id=x.id;
  END IF;
 END IF;
 UPDATE metadata_compaction_state SET revision=revision+1 WHERE id;
 INSERT INTO metadata_vessel_revisions(mmsi,revision) VALUES(g->>'mmsi',1) ON CONFLICT(mmsi) DO UPDATE SET revision=metadata_vessel_revisions.revision+1;
 RETURN true;
END;
$$;
CREATE OR REPLACE FUNCTION apply_metadata_groups_batch_beta(changes JSONB)
RETURNS BOOLEAN LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE change JSONB;
BEGIN
 IF jsonb_typeof(changes)<>'array' OR jsonb_array_length(changes)>8 THEN RAISE EXCEPTION 'METADATA_BATCH_INVALID'; END IF;
 BEGIN
  FOR change IN SELECT value FROM jsonb_array_elements(changes) LOOP
   IF NOT apply_metadata_group_beta(change->'g',change->>'previous_checksum',change->'expected_rows') THEN RAISE EXCEPTION 'METADATA_CONCURRENT_RETRY'; END IF;
  END LOOP;
  RETURN true;
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='METADATA_CONCURRENT_RETRY' THEN RETURN false; ELSE RAISE; END IF;
 END;
END;
$$;
REVOKE ALL ON FUNCTION apply_metadata_groups_batch_beta(JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION apply_metadata_groups_batch_beta(JSONB) TO service_role;
CREATE OR REPLACE FUNCTION nearby_metadata_groups_beta(query_lat DOUBLE PRECISION,query_lon DOUBLE PRECISION,lat_span DOUBLE PRECISION,lon_span DOUBLE PRECISION)
RETURNS SETOF metadata_groups LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
 SELECT * FROM metadata_groups WHERE kind='detected_stops'
 AND area && box(point(query_lon-lon_span,query_lat-lat_span),point(query_lon+lon_span,query_lat+lat_span))
 ORDER BY max_arrived_at DESC,mmsi,month;
$$;
REVOKE ALL ON FUNCTION apply_metadata_group_beta(JSONB,TEXT,JSONB),nearby_metadata_groups_beta(DOUBLE PRECISION,DOUBLE PRECISION,DOUBLE PRECISION,DOUBLE PRECISION) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION apply_metadata_group_beta(JSONB,TEXT,JSONB),nearby_metadata_groups_beta(DOUBLE PRECISION,DOUBLE PRECISION,DOUBLE PRECISION,DOUBLE PRECISION) TO service_role;
COMMIT;
BEGIN;
CREATE OR REPLACE FUNCTION storage_metrics_compact_beta() RETURNS JSONB LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
 SELECT storage_metrics_beta() || jsonb_build_object(
  'metadata_group_bytes',pg_total_relation_size('metadata_groups'),
  'metadata_bytes',((storage_metrics_beta()->>'metadata_bytes')::bigint+pg_total_relation_size('metadata_groups')+pg_total_relation_size('metadata_compaction_state')+pg_total_relation_size('metadata_vessel_revisions')),
  'archive_bytes',((storage_metrics_beta()->>'archive_bytes')::bigint+(SELECT coalesce(sum(archive_bytes),0) FROM metadata_groups WHERE kind='track_archives')-(SELECT coalesce(sum((g.archive_sizes->>t.day::text)::bigint),0) FROM track_archives t JOIN metadata_groups g ON g.kind='track_archives' AND g.mmsi=t.mmsi AND g.month=date_trunc('month',t.day)::date WHERE g.archive_sizes ? t.day::text)),
  'archive_objects',((storage_metrics_beta()->>'archive_objects')::bigint+(SELECT coalesce(sum(row_count),0) FROM metadata_groups WHERE kind='track_archives')-(SELECT count(*) FROM track_archives t JOIN metadata_groups g ON g.kind='track_archives' AND g.mmsi=t.mmsi AND g.month=date_trunc('month',t.day)::date WHERE g.archive_sizes ? t.day::text)),
  'first_observation_at',(SELECT min(first_at) FROM (SELECT min(first_at) first_at FROM track_archives UNION ALL SELECT min(first_at) FROM metadata_groups WHERE kind='track_archives')x),
  'last_observation_at',(SELECT max(last_at) FROM (SELECT max(last_at) last_at FROM track_archives UNION ALL SELECT max(last_at) FROM metadata_groups WHERE kind='track_archives')x),
  'metadata_group_count',(SELECT count(*) FROM metadata_groups),
  'relations',(SELECT jsonb_agg(jsonb_build_object('table',c.relname,'table_bytes',pg_table_size(c.oid),'index_bytes',pg_indexes_size(c.oid),'total_bytes',pg_total_relation_size(c.oid),'estimated_rows',s.n_live_tup,'estimated_dead_rows',s.n_dead_tup)) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_stat_user_tables s ON s.relid=c.oid WHERE n.nspname='public' AND c.relkind='r')
 );
$$;
REVOKE ALL ON FUNCTION storage_metrics_compact_beta() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION storage_metrics_compact_beta() TO service_role;
COMMIT;

BEGIN;
CREATE OR REPLACE FUNCTION prune_metadata_beta(before_time TIMESTAMPTZ)
RETURNS VOID LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 DELETE FROM anomaly_events WHERE detected_at<before_time;
 DELETE FROM detected_stops WHERE departed_at IS NOT NULL AND greatest(arrived_at,last_seen_at,departed_at)<before_time;
END;
$$;
CREATE OR REPLACE FUNCTION nearby_stops_beta(query_lat DOUBLE PRECISION,query_lon DOUBLE PRECISION,max_rows INTEGER DEFAULT 51)
RETURNS SETOF detected_stops LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
  SELECT s.* FROM detected_stops s
  WHERE (s.departed_at IS NULL OR greatest(s.arrived_at,s.departed_at,s.last_seen_at)>=now()-interval '90 days')
    AND abs(s.port_lat-query_lat)<=0.0046
    AND least(abs(s.port_lon-query_lon),360-abs(s.port_lon-query_lon))<=0.0046/greatest(abs(cos(radians(query_lat))),0.000001)
    AND 6378137*acos(greatest(-1.0,least(1.0,
      sin(radians(s.port_lat))*sin(radians(query_lat))+
      cos(radians(s.port_lat))*cos(radians(query_lat))*cos(radians(s.port_lon-query_lon)))))<=500
  ORDER BY s.arrived_at DESC,s.id
  LIMIT greatest(1,least(coalesce(max_rows,51),51));
$$;
REVOKE ALL ON FUNCTION prune_metadata_beta(TIMESTAMPTZ),nearby_stops_beta(DOUBLE PRECISION,DOUBLE PRECISION,INTEGER) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION prune_metadata_beta(TIMESTAMPTZ),nearby_stops_beta(DOUBLE PRECISION,DOUBLE PRECISION,INTEGER) TO service_role;
COMMIT;

-- Helpers only. This migration never removes data. Requires verified backup.
BEGIN;
CREATE OR REPLACE FUNCTION legacy_positions_fingerprint_beta()
RETURNS TEXT LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
 SELECT encode(sha256(convert_to(coalesce(string_agg(
  encode(sha256(convert_to((to_jsonb(p)||jsonb_build_object('timestamp',to_char(p.timestamp AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')))::text,'UTF8')),'hex'),'' ORDER BY mmsi,timestamp),''),'UTF8')),'hex') FROM vessel_positions p;
$$;
CREATE OR REPLACE FUNCTION retire_legacy_positions_beta(expected_rows BIGINT,expected_first TIMESTAMPTZ,expected_last TIMESTAMPTZ,expected_fingerprint TEXT,verified_manifest_sha256 TEXT)
RETURNS JSONB LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE actual_rows BIGINT; actual_first TIMESTAMPTZ; actual_last TIMESTAMPTZ; before_bytes BIGINT;
BEGIN
 SET LOCAL lock_timeout='2s';
 IF expected_rows IS NULL OR expected_first IS NULL OR expected_last IS NULL OR expected_fingerprint IS NULL OR verified_manifest_sha256 IS NULL OR expected_rows<=0 OR expected_last>='2026-03-16T00:00:00Z' OR verified_manifest_sha256 !~ '^[a-f0-9]{64}$' OR expected_fingerprint !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'LEGACY_PROOF_INVALID'; END IF;
 LOCK TABLE vessel_positions IN ACCESS EXCLUSIVE MODE;
 IF EXISTS(SELECT 1 FROM pg_constraint WHERE contype='f' AND confrelid='vessel_positions'::regclass) OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='vessel_positions'::regclass AND NOT tgisinternal) THEN RAISE EXCEPTION 'LEGACY_UNEXPECTED_DEPENDENCY'; END IF;
 SELECT count(*),min(timestamp),max(timestamp) INTO actual_rows,actual_first,actual_last FROM vessel_positions;
 IF actual_rows<>expected_rows OR actual_first IS DISTINCT FROM expected_first OR actual_last IS DISTINCT FROM expected_last OR legacy_positions_fingerprint_beta() IS DISTINCT FROM expected_fingerprint THEN RAISE EXCEPTION 'LEGACY_SOURCE_CHANGED'; END IF;
 before_bytes:=pg_total_relation_size('vessel_positions');
 TRUNCATE TABLE public.vessel_positions RESTRICT;
 RETURN jsonb_build_object('rows_archived',actual_rows,'table_bytes_before',before_bytes,'table_bytes_after',pg_total_relation_size('vessel_positions'),'verified_manifest_sha256',verified_manifest_sha256);
END;
$$;
REVOKE ALL ON FUNCTION legacy_positions_fingerprint_beta(),retire_legacy_positions_beta(BIGINT,TIMESTAMPTZ,TIMESTAMPTZ,TEXT,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION legacy_positions_fingerprint_beta(),retire_legacy_positions_beta(BIGINT,TIMESTAMPTZ,TIMESTAMPTZ,TEXT,TEXT) TO service_role;
COMMIT;

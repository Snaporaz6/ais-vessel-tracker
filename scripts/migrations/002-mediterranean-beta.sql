-- ADDITIVE. Backup and verify the existing database BEFORE execution.
-- New installations: first run init-db-free-tier.sql. No TimescaleDB.
BEGIN;
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
COMMIT;

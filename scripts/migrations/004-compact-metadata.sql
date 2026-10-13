-- Additive migration. Apply only after a verified backup.
BEGIN;
CREATE TABLE IF NOT EXISTS metadata_groups (
 kind TEXT NOT NULL CHECK(kind IN ('track_archives','detected_stops','anomaly_events')),
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
ALTER TABLE metadata_groups DROP CONSTRAINT IF EXISTS metadata_groups_kind_check;
ALTER TABLE metadata_groups ADD CONSTRAINT metadata_groups_kind_check CHECK(kind IN ('track_archives','detected_stops','anomaly_events'));
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
 IF g->>'kind' NOT IN ('track_archives','detected_stops','anomaly_events') OR g->>'mmsi' !~ '^[1-9][0-9]{8}$' OR jsonb_typeof(expected_rows)<>'array' THEN RAISE EXCEPTION 'METADATA_GROUP_INVALID'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext((g->>'kind')||':'||(g->>'mmsi')||':'||(g->>'month')));
 SELECT checksum INTO old_hash FROM metadata_groups WHERE kind=g->>'kind' AND mmsi=g->>'mmsi' AND month=(g->>'month')::date FOR UPDATE;
 IF old_hash IS DISTINCT FROM previous_checksum THEN RETURN false; END IF;
 expected:=jsonb_array_length(expected_rows);
 IF g->>'kind'='track_archives' THEN
  PERFORM 1 FROM track_archives t JOIN jsonb_populate_recordset(NULL::track_archives,expected_rows) x USING(mmsi,day) FOR UPDATE OF t;
  SELECT count(*) INTO matches FROM track_archives t JOIN jsonb_populate_recordset(NULL::track_archives,expected_rows) x USING(mmsi,day) WHERE t IS NOT DISTINCT FROM x;
 ELSIF g->>'kind'='anomaly_events' THEN
  PERFORM 1 FROM anomaly_events t JOIN jsonb_populate_recordset(NULL::anomaly_events,expected_rows) x USING(id) FOR UPDATE OF t;
  SELECT count(*) INTO matches FROM anomaly_events t JOIN jsonb_populate_recordset(NULL::anomaly_events,expected_rows) x USING(id) WHERE t IS NOT DISTINCT FROM x;
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
  ELSIF g->>'kind'='anomaly_events' THEN
   DELETE FROM anomaly_events t USING jsonb_populate_recordset(NULL::anomaly_events,expected_rows) x WHERE t.id=x.id;
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
-- Preserve original serial IDs in v2 restores and advance their next values.
-- Invoker rights: advance with existing USAGE/nextval privileges; no UPDATE grant.
-- Sequence progress survives a timeout, so retrying restore continues safely.
CREATE OR REPLACE FUNCTION finish_restore_beta() RETURNS VOID LANGUAGE plpgsql SET search_path=public,pg_temp SET statement_timeout='60s' AS $$
DECLARE table_name TEXT; sequence_name TEXT; maximum BIGINT; current_value BIGINT;
BEGIN
 FOREACH table_name IN ARRAY ARRAY['anomaly_events','sanctions'] LOOP
  sequence_name := pg_get_serial_sequence(table_name,'id');
  EXECUTE format('SELECT max(id) FROM %I',table_name) INTO maximum;
  IF sequence_name IS NOT NULL AND maximum IS NOT NULL THEN
   current_value := nextval(sequence_name::regclass);
   WHILE current_value < maximum LOOP current_value := nextval(sequence_name::regclass); END LOOP;
  END IF;
 END LOOP;
END; $$;
REVOKE ALL ON FUNCTION finish_restore_beta() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION finish_restore_beta() TO service_role;
COMMIT;

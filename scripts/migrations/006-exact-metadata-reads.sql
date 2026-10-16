-- Exact JSON is formed inside the function, before PostgREST's float formatting.
BEGIN;
CREATE OR REPLACE FUNCTION metadata_hot_page_beta(table_name TEXT, after_key TEXT DEFAULT NULL,
 after_mmsi TEXT DEFAULT NULL, cold_before TIMESTAMPTZ DEFAULT NULL, upper_key TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql STABLE SET search_path=public,pg_temp SET extra_float_digits=3 SET timezone='UTC' AS $$
DECLARE result JSONB; key_name TEXT; key_type TEXT; predicate TEXT;
BEGIN
 IF table_name NOT IN ('vessels','track_archives','detected_stops','anomaly_events','sanctions','import_states') THEN
  RAISE EXCEPTION 'METADATA_TABLE_INVALID';
 END IF;
 IF cold_before IS NOT NULL AND table_name NOT IN ('track_archives','detected_stops','anomaly_events') THEN
  RAISE EXCEPTION 'METADATA_CUTOFF_INVALID';
 END IF;
 IF table_name='track_archives' THEN
  SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) INTO result FROM (
   SELECT * FROM track_archives WHERE
    (after_key IS NULL OR (mmsi,day)>(after_mmsi,after_key::date))
    AND (cold_before IS NULL OR day<cold_before::date)
   ORDER BY mmsi,day LIMIT 500
  ) t;
 ELSE
  key_name:=CASE table_name WHEN 'vessels' THEN 'mmsi' WHEN 'import_states' THEN 'source' ELSE 'id' END;
  key_type:=CASE WHEN table_name IN ('anomaly_events','sanctions') THEN 'bigint' ELSE 'text' END;
  predicate:=CASE table_name
   WHEN 'detected_stops' THEN 'AND ($3 IS NULL OR (arrived_at<$3 AND departed_at<$3 AND last_seen_at<$3))'
   WHEN 'anomaly_events' THEN 'AND ($3 IS NULL OR detected_at<$3)' ELSE '' END;
  EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(t)),''[]''::jsonb) FROM (SELECT * FROM %I WHERE ($1 IS NULL OR %I>$1::%s) AND ($2 IS NULL OR %I<=$2::%s) %s ORDER BY %I LIMIT 500) t',
   table_name,key_name,key_type,key_name,key_type,predicate,key_name)
   INTO result USING after_key,upper_key,cold_before;
 END IF;
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION metadata_hot_page_beta(TEXT,TEXT,TEXT,TIMESTAMPTZ,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION metadata_hot_page_beta(TEXT,TEXT,TEXT,TIMESTAMPTZ,TEXT) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;

-- Helpers only. This migration never removes data. Requires verified backup.
BEGIN;
CREATE OR REPLACE FUNCTION legacy_positions_fingerprint_beta()
RETURNS TEXT LANGUAGE sql STABLE SET search_path=public,pg_temp SET statement_timeout='60s' AS $$
 SELECT encode(sha256(convert_to(coalesce(string_agg(
  encode(sha256(convert_to((to_jsonb(p)||jsonb_build_object('timestamp',to_char(p.timestamp AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')))::text,'UTF8')),'hex'),'' ORDER BY mmsi,timestamp),''),'UTF8')),'hex') FROM vessel_positions p;
$$;
CREATE OR REPLACE FUNCTION retire_legacy_positions_beta(expected_rows BIGINT,expected_first TIMESTAMPTZ,expected_last TIMESTAMPTZ,expected_fingerprint TEXT,verified_manifest_sha256 TEXT)
RETURNS JSONB LANGUAGE plpgsql SET search_path=public,pg_temp SET statement_timeout='60s' AS $$
DECLARE actual_rows BIGINT; actual_first TIMESTAMPTZ; actual_last TIMESTAMPTZ; before_bytes BIGINT;
BEGIN
 SET LOCAL lock_timeout='2s';
 IF expected_rows IS NULL OR expected_first IS NULL OR expected_last IS NULL OR expected_fingerprint IS NULL OR verified_manifest_sha256 IS NULL OR expected_rows<=0 OR expected_last>='2026-03-16T00:00:00Z' OR verified_manifest_sha256 !~ '^[a-f0-9]{64}$' OR expected_fingerprint !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'LEGACY_PROOF_INVALID'; END IF;
 LOCK TABLE vessel_positions IN ACCESS EXCLUSIVE MODE;
 IF EXISTS(SELECT 1 FROM pg_inherits WHERE inhparent='vessel_positions'::regclass OR inhrelid='vessel_positions'::regclass) OR EXISTS(SELECT 1 FROM pg_constraint WHERE contype='f' AND confrelid='vessel_positions'::regclass) OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='vessel_positions'::regclass AND NOT tgisinternal) THEN RAISE EXCEPTION 'LEGACY_UNEXPECTED_DEPENDENCY'; END IF;
 SELECT count(*),min(timestamp),max(timestamp) INTO actual_rows,actual_first,actual_last FROM vessel_positions;
 IF actual_rows<>expected_rows OR actual_first IS DISTINCT FROM expected_first OR actual_last IS DISTINCT FROM expected_last OR legacy_positions_fingerprint_beta() IS DISTINCT FROM expected_fingerprint THEN RAISE EXCEPTION 'LEGACY_SOURCE_CHANGED'; END IF;
 before_bytes:=pg_total_relation_size('vessel_positions');
 TRUNCATE TABLE ONLY public.vessel_positions RESTRICT;
 RETURN jsonb_build_object('rows_archived',actual_rows,'table_bytes_before',before_bytes,'table_bytes_after',pg_total_relation_size('vessel_positions'),'verified_manifest_sha256',verified_manifest_sha256);
END;
$$;
REVOKE ALL ON FUNCTION legacy_positions_fingerprint_beta(),retire_legacy_positions_beta(BIGINT,TIMESTAMPTZ,TIMESTAMPTZ,TEXT,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION legacy_positions_fingerprint_beta(),retire_legacy_positions_beta(BIGINT,TIMESTAMPTZ,TIMESTAMPTZ,TEXT,TEXT) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;

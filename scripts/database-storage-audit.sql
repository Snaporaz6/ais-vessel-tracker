-- Diagnostic only: run as the database owner in Supabase SQL Editor.
-- Estimated row/update counters are statistics, not exact row counts.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '15s';
SET LOCAL lock_timeout = '2s';

SELECT now() AS measured_at, pg_database_size(current_database()) AS database_bytes;

SELECT c.relname AS table_name,
       pg_table_size(c.oid) AS table_bytes,
       pg_indexes_size(c.oid) AS index_bytes,
       pg_total_relation_size(c.oid) AS total_bytes,
       s.n_live_tup AS estimated_live_rows,
       s.n_dead_tup AS estimated_dead_rows,
       s.n_tup_ins AS inserts_since_statistics_reset,
       s.n_tup_upd AS updates_since_statistics_reset,
       s.n_tup_hot_upd AS hot_updates_since_statistics_reset,
       s.last_autovacuum, s.last_autoanalyze
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY total_bytes DESC;

SELECT t.relname AS table_name, i.relname AS index_name,
       pg_relation_size(i.oid) AS bytes,
       x.indisprimary, x.indisunique,
       pg_get_indexdef(i.oid) AS definition,
       coalesce(s.idx_scan, 0) AS scans_since_statistics_reset
FROM pg_index x
JOIN pg_class i ON i.oid = x.indexrelid
JOIN pg_class t ON t.oid = x.indrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
LEFT JOIN pg_stat_user_indexes s ON s.indexrelid = i.oid
WHERE n.nspname = 'public'
ORDER BY bytes DESC;

SELECT count(*) AS stops,
       count(*) FILTER (WHERE departed_at IS NULL) AS open_stops,
       count(*) FILTER (WHERE uncertain_departure) AS uncertain_stops,
       count(*) FILTER (WHERE duration_hours < 1) AS under_one_hour,
       count(*) FILTER (WHERE duration_hours >= 24) AS over_one_day
FROM detected_stops;

COMMIT;

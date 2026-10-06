-- Query località limitata nel database, sulle stesse soste rilevate dall'acquisitore.
BEGIN;
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

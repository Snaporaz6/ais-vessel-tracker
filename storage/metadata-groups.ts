import { gzipSync, gunzipSync } from "node:zlib";
import { isDeepStrictEqual } from "node:util";
import { checksum } from "./object-store.js";
export type GroupKind = "track_archives" | "detected_stops" | "anomaly_events";
export const GROUP_KINDS = [
  "track_archives",
  "detected_stops",
  "anomaly_events",
] as const;
export type MetadataRow = Record<string, any>;
export interface MetadataGroup {
  kind: GroupKind;
  mmsi: string;
  month: string;
  version: number;
  payload: string;
  checksum: string;
  row_count: number;
  archive_bytes: number;
  archive_sizes: Record<string, number>;
  first_at: string;
  last_at: string;
  max_arrived_at: string | null;
  min_lat: number | null;
  max_lat: number | null;
  min_lon: number | null;
  max_lon: number | null;
}
export function rowKey(kind: GroupKind, row: MetadataRow) {
  return kind === "track_archives"
    ? row.mmsi + ":" + row.day
    : kind === "anomaly_events"
      ? String(row.event_key ?? row.id)
      : String(row.id);
}
export function rowMonth(kind: GroupKind, row: MetadataRow) {
  return (
    new Date(
      kind === "track_archives"
        ? row.day
        : kind === "anomaly_events"
          ? row.detected_at
          : row.arrived_at,
    )
      .toISOString()
      .slice(0, 7) + "-01"
  );
}
export function decodeGroup(g: MetadataGroup): MetadataRow[] {
  const bytes = Buffer.from(g.payload.replace(/^\\x/, ""), "hex");
  if (checksum(bytes) !== g.checksum)
    throw new Error("METADATA_CHECKSUM_MISMATCH");
  const data = JSON.parse(
    gunzipSync(bytes, { maxOutputLength: 8 * 1024 * 1024 }).toString(),
  );
  if (
    !GROUP_KINDS.includes(g.kind) ||
    g.version !== 1 ||
    data.version !== 1 ||
    !Array.isArray(data.rows) ||
    data.rows.length !== g.row_count ||
    data.rows.length > 20000 ||
    data.rows.some(
      (r: MetadataRow) => r.mmsi !== g.mmsi || rowMonth(g.kind, r) !== g.month,
    )
  )
    throw new Error("METADATA_GROUP_INVALID");
  if (
    new Set(data.rows.map((r: MetadataRow) => rowKey(g.kind, r))).size !==
    data.rows.length
  )
    throw new Error("METADATA_GROUP_DUPLICATES");
  return data.rows;
}
export function encodeGroup(
  kind: GroupKind,
  mmsi: string,
  month: string,
  rows: MetadataRow[],
) {
  const data = Buffer.from(JSON.stringify({ version: 1, rows }));
  if (data.length > 8 * 1024 * 1024 || rows.length > 20000)
    throw new Error("METADATA_GROUP_TOO_LARGE");
  const bytes = gzipSync(data);
  if (bytes.length > 4 * 1024 * 1024)
    throw new Error("METADATA_GROUP_TOO_LARGE");
  const times = rows
    .flatMap((r) =>
      kind === "track_archives"
        ? [r.first_at, r.last_at]
        : kind === "anomaly_events"
          ? [r.detected_at]
          : [
              r.arrived_at,
              r.last_seen_at ?? r.arrived_at,
              r.departed_at ?? r.arrived_at,
            ],
    )
    .map((s) => new Date(s).toISOString())
    .sort();
  const stops = kind === "detected_stops" ? rows : [];
  const g: MetadataGroup = {
    kind,
    mmsi,
    month,
    version: 1,
    payload: "\\x" + bytes.toString("hex"),
    checksum: checksum(bytes),
    row_count: rows.length,
    archive_bytes:
      kind === "track_archives"
        ? rows.reduce((n, r) => n + r.compressed_bytes, 0)
        : 0,
    archive_sizes:
      kind === "track_archives"
        ? Object.fromEntries(rows.map((r) => [r.day, r.compressed_bytes]))
        : {},
    first_at: times[0] ?? month,
    last_at: times.at(-1) ?? month,
    max_arrived_at: stops.length
      ? stops
          .map((r) => r.arrived_at)
          .sort()
          .at(-1)!
      : null,
    min_lat: stops.length ? Math.min(...stops.map((r) => r.port_lat)) : null,
    max_lat: stops.length ? Math.max(...stops.map((r) => r.port_lat)) : null,
    min_lon: stops.length ? Math.min(...stops.map((r) => r.port_lon)) : null,
    max_lon: stops.length ? Math.max(...stops.map((r) => r.port_lon)) : null,
  };
  if (rows.length && !isDeepStrictEqual(decodeGroup(g), rows))
    throw new Error("METADATA_ROUNDTRIP_FAILED");
  return g;
}

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  Vessel,
  AnomalyEvent,
  ArchiveEntry,
  PortCall,
  SanctionRecord,
} from "../shared/types.js";
import { getDistance } from "geolib";

export type Source = "OFAC" | "EU";
export interface ImportState {
  source: Source;
  updated_at: string | null;
  attempted_at: string;
  last_error: string | null;
  record_count: number;
}
export interface Snapshot {
  vessels: Vessel[];
  anomaly_events: (AnomalyEvent & { event_key?: string })[];
  detected_stops: PortCall[];
  track_archives: ArchiveEntry[];
  sanctions: SanctionRecord[];
  import_states: ImportState[];
}
export const TABLES = [
  "vessels",
  "anomaly_events",
  "detected_stops",
  "track_archives",
  "sanctions",
  "import_states",
] as const;
export type Table = (typeof TABLES)[number];
export interface StorageMetrics {
  database_bytes: number;
  metadata_bytes: number;
  archive_bytes: number;
  archive_objects: number;
  first_observation_at: string | null;
  last_observation_at: string | null;
}
export interface Repository {
  all<T>(table: Table): Promise<T[]>;
  iterateArchives(): AsyncIterable<ArchiveEntry>;
  upsert(table: Table, rows: unknown[]): Promise<void>;
  vessel(mmsi: string): Promise<Vessel | null>;
  search(q: string): Promise<Vessel[]>;
  archives(mmsi?: string, fromDay?: string): Promise<ArchiveEntry[]>;
  deleteArchive(entry: ArchiveEntry): Promise<void>;
  anomalies(mmsi: string): Promise<AnomalyEvent[]>;
  stops(mmsi?: string): Promise<PortCall[]>;
  nearbyStops(lat: number, lon: number): Promise<PortCall[]>;
  replaceSanctions(
    source: Source,
    rows: SanctionRecord[],
    at: string,
  ): Promise<void>;
  importFailure(source: Source, at: string): Promise<void>;
  prune(before: string): Promise<void>;
  health(): Promise<void>;
  metrics(): Promise<StorageMetrics>;
}

// Do not include provider error bodies or URLs in public errors/logs.
function checked<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw new Error("DATABASE_UNAVAILABLE");
  return result.data;
}
const CONFLICT: Record<Table, string> = {
  vessels: "mmsi",
  anomaly_events: "event_key",
  detected_stops: "id",
  track_archives: "mmsi,day",
  sanctions: "id",
  import_states: "source",
};
export class PostgresRepository implements Repository {
  readonly client: SupabaseClient;
  constructor(url: string, key: string) {
    this.client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (url, init) =>
          fetch(url, { ...init, signal: AbortSignal.timeout(15_000) }),
      },
    });
  }
  async all<T>(table: Table): Promise<T[]> {
    if (table === "track_archives") {
      const rows: T[] = [];
      for await (const row of this.iterateArchives()) rows.push(row as T);
      return rows;
    }
    const rows: T[] = [];
    const key =
      table === "vessels"
        ? "mmsi"
        : table === "import_states"
          ? "source"
          : "id";
    // Bound the scan and advance by immutable primary key. Offsets repeat/skip
    // existing records when the live ingestor inserts a key in an earlier page.
    const upper = checked(
      await this.client
        .from(table)
        .select(key)
        .order(key, { ascending: false })
        .limit(1),
    ) as Record<string, string | number>[];
    if (!upper.length) return rows;
    let cursor: string | number | undefined;
    for (;;) {
      let query = this.client
        .from(table)
        .select("*")
        .order(key)
        .lte(key, upper[0][key])
        .limit(500);
      if (cursor !== undefined) query = query.gt(key, cursor);
      const page = checked(await query) as T[];
      rows.push(...page);
      if (page.length < 500) return rows;
      cursor = (page.at(-1) as Record<string, string | number>)[key];
    }
  }
  async upsert(table: Table, rows: unknown[]): Promise<void> {
    for (let i = 0; i < rows.length; i += 100)
      checked(
        await this.client
          .from(table)
          .upsert(rows.slice(i, i + 100), { onConflict: CONFLICT[table] }),
      );
  }
  async vessel(mmsi: string) {
    return checked(
      await this.client
        .from("vessels")
        .select("*")
        .eq("mmsi", mmsi)
        .maybeSingle(),
    ) as Vessel | null;
  }
  async search(q: string) {
    return checked(
      await this.client.rpc("search_vessels_beta", { query_text: q }),
    ) as Vessel[];
  }
  async archives(mmsi?: string, fromDay?: string): Promise<ArchiveEntry[]> {
    const out: ArchiveEntry[] = [];
    for (let i = 0; ; i += 500) {
      let query = this.client
        .from("track_archives")
        .select("*")
        .order("mmsi")
        .order("day");
      if (mmsi) query = query.eq("mmsi", mmsi);
      if (fromDay) query = query.gte("day", fromDay);
      const page = checked(await query.range(i, i + 499)) as ArchiveEntry[];
      out.push(...page);
      if (page.length < 500) return out;
    }
  }
  async *iterateArchives(): AsyncGenerator<ArchiveEntry> {
    let cursor: ArchiveEntry | undefined;
    for (;;) {
      let query = this.client
        .from("track_archives")
        .select("*")
        .order("mmsi")
        .order("day")
        .limit(500);
      if (cursor)
        query = query.or(
          `mmsi.gt.${cursor.mmsi},and(mmsi.eq.${cursor.mmsi},day.gt.${cursor.day})`,
        );
      const page = checked(await query) as ArchiveEntry[];
      for (const row of page) yield row;
      if (page.length < 500) return;
      cursor = page.at(-1)!;
    }
  }
  async deleteArchive(e: ArchiveEntry) {
    checked(
      await this.client
        .from("track_archives")
        .delete()
        .eq("mmsi", e.mmsi)
        .eq("day", e.day)
        .eq("checksum", e.checksum),
    );
  }
  async anomalies(mmsi: string) {
    const rows =
      checked(
        await this.client
          .from("anomaly_events")
          .select("*")
          .eq("mmsi", mmsi)
          .order("detected_at", { ascending: false })
          .limit(100),
      ) ?? [];
    return rows.map((r) => ({
      ...r,
      id: r.event_key ?? String(r.id),
    })) as AnomalyEvent[];
  }
  async stops(mmsi?: string): Promise<PortCall[]> {
    const out: PortCall[] = [];
    for (let i = 0; ; i += 500) {
      let q = this.client
        .from("detected_stops")
        .select("*")
        .gte("arrived_at", new Date(Date.now() - 90 * 86400_000).toISOString())
        .order("arrived_at", { ascending: false })
        .order("id");
      if (mmsi) q = q.eq("mmsi", mmsi);
      const rows = checked(await q.range(i, i + 499)) as PortCall[];
      out.push(...rows);
      if (rows.length < 500) return out;
    }
  }
  async nearbyStops(lat: number, lon: number): Promise<PortCall[]> {
    return checked(
      await this.client.rpc("nearby_stops_beta", {
        query_lat: lat,
        query_lon: lon,
        max_rows: 51,
      }),
    ) as PortCall[];
  }
  async replaceSanctions(
    source: Source,
    records: SanctionRecord[],
    at: string,
  ) {
    checked(
      await this.client.rpc("replace_sanctions_beta", {
        source_name: source,
        records,
        checked_at: at,
      }),
    );
  }
  async importFailure(source: Source, at: string) {
    checked(
      await this.client.rpc("fail_sanctions_beta", {
        source_name: source,
        checked_at: at,
      }),
    );
  }
  async prune(before: string) {
    checked(
      await this.client.rpc("prune_metadata_beta", { before_time: before }),
    );
  }
  async health() {
    checked(await this.client.from("track_archives").select("mmsi").limit(1));
    checked(await this.client.from("detected_stops").select("id").limit(1));
    checked(await this.client.from("import_states").select("source").limit(1));
  }
  async metrics() {
    return checked(
      await this.client.rpc("storage_metrics_beta"),
    ) as StorageMetrics;
  }
}

// Explicit local demo and test adapter; never selected by production configuration.
export class MemoryRepository implements Repository {
  data = Object.fromEntries(TABLES.map((t) => [t, []])) as unknown as Record<
    Table,
    any[]
  >;
  async all<T>(table: Table) {
    return structuredClone(this.data[table]) as T[];
  }
  async upsert(table: Table, rows: any[]) {
    for (const row of rows) {
      const keys = CONFLICT[table].split(",");
      const index = this.data[table].findIndex((r) =>
        keys.every((k) => r[k] === row[k]),
      );
      if (index < 0) this.data[table].push(structuredClone(row));
      else
        this.data[table][index] = {
          ...this.data[table][index],
          ...structuredClone(row),
        };
    }
  }
  async vessel(mmsi: string) {
    return (
      (await this.all<Vessel>("vessels")).find((v) => v.mmsi === mmsi) ?? null
    );
  }
  async search(q: string) {
    const rows = await this.all<Vessel>("vessels");
    if (/^\d+$/.test(q)) return rows.filter((v) => v.mmsi === q || v.imo === q);
    const trigrams = (s: string) =>
      new Set(
        Array.from({ length: Math.max(s.length + 2, 0) }, (_, i) =>
          `  ${s.toLowerCase()} `.slice(i, i + 3),
        ),
      );
    const a = trigrams(q);
    const score = (s: string) => {
      const b = trigrams(s);
      return [...a].filter((x) => b.has(x)).length / Math.max(a.size, b.size);
    };
    return rows
      .filter((v) => score(v.name) > 0.25)
      .sort((a, b) => score(b.name) - score(a.name))
      .slice(0, 20);
  }
  async archives(mmsi?: string, day?: string) {
    return (await this.all<ArchiveEntry>("track_archives")).filter(
      (e) => (!mmsi || e.mmsi === mmsi) && (!day || e.day >= day),
    );
  }
  async *iterateArchives(): AsyncGenerator<ArchiveEntry> {
    for (const entry of [...this.data.track_archives].sort(
      (a, b) => a.mmsi.localeCompare(b.mmsi) || a.day.localeCompare(b.day),
    ))
      yield structuredClone(entry);
  }
  async deleteArchive(e: ArchiveEntry) {
    this.data.track_archives = this.data.track_archives.filter(
      (x) => x.mmsi !== e.mmsi || x.day !== e.day || x.checksum !== e.checksum,
    );
  }
  async anomalies(mmsi: string) {
    return (await this.all<AnomalyEvent>("anomaly_events"))
      .filter((x) => x.mmsi === mmsi)
      .sort((a, b) => b.detected_at.localeCompare(a.detected_at))
      .slice(0, 100);
  }
  async stops(mmsi?: string) {
    return (await this.all<PortCall>("detected_stops"))
      .filter((x) => !mmsi || x.mmsi === mmsi)
      .sort((a, b) => b.arrived_at.localeCompare(a.arrived_at));
  }
  async nearbyStops(lat: number, lon: number) {
    const cutoff = new Date(Date.now() - 90 * 86400_000).toISOString();
    return (await this.stops())
      .filter(
        (s) =>
          s.arrived_at >= cutoff &&
          getDistance(
            { latitude: lat, longitude: lon },
            { latitude: s.port_lat, longitude: s.port_lon },
          ) <= 500,
      )
      .slice(0, 51);
  }
  async replaceSanctions(
    source: Source,
    records: SanctionRecord[],
    at: string,
  ) {
    const old = this.data.sanctions.filter((s) => s.source === source);
    if (
      !records.length ||
      (old.length && records.length < old.length * 0.7) ||
      records.some(
        (r) =>
          r.source !== source ||
          !r.name ||
          (r.mmsi && !/^[1-9]\d{8}$/.test(r.mmsi)) ||
          (r.imo && !/^\d{7}$/.test(r.imo)),
      )
    )
      throw new Error("INVALID_SANCTIONS_IMPORT");
    this.data.sanctions = [
      ...this.data.sanctions.filter((s) => s.source !== source),
      ...structuredClone(records),
    ];
    await this.upsert("import_states", [
      {
        source,
        updated_at: at,
        attempted_at: at,
        last_error: null,
        record_count: records.length,
      },
    ]);
  }
  async importFailure(source: Source, at: string) {
    const old = this.data.import_states.find((s) => s.source === source);
    await this.upsert("import_states", [
      {
        source,
        updated_at: null,
        record_count: 0,
        ...old,
        attempted_at: at,
        last_error: "IMPORT_FAILED",
      },
    ]);
  }
  async prune(before: string) {
    for (const [table, field] of [
      ["anomaly_events", "detected_at"],
      ["detected_stops", "arrived_at"],
    ] as const)
      this.data[table] = this.data[table].filter((r) => r[field] >= before);
  }
  async health() {}
  async metrics() {
    const entries = await this.archives();
    const bytes = Buffer.byteLength(JSON.stringify(this.data));
    return {
      database_bytes: bytes,
      metadata_bytes: bytes,
      archive_bytes: entries.reduce((n, e) => n + e.compressed_bytes, 0),
      archive_objects: entries.length,
      first_observation_at: entries.map((e) => e.first_at).sort()[0] ?? null,
      last_observation_at:
        entries
          .map((e) => e.last_at)
          .sort()
          .at(-1) ?? null,
    };
  }
}

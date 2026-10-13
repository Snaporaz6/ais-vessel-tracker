import { isDeepStrictEqual } from "node:util";
import { getDistance } from "geolib";
import { PostgresRepository, type Table } from "./repository.js";
import type { ArchiveEntry, PortCall, AnomalyEvent } from "../shared/types.js";
import {
  decodeGroup,
  GROUP_KINDS,
  encodeGroup,
  rowKey,
  rowMonth,
  type GroupKind,
  type MetadataGroup,
  type MetadataRow,
} from "./metadata-groups.js";
import { checkedDatabase as checked } from "../shared/database-errors.js";
export class CompactRepository extends PostgresRepository {
  async archiveReferences(checkDeadline: () => void) {
    return this.consistentRead(async () => {
      const refs = new Set<string>();
      for await (const entry of this.iterateArchives()) {
        checkDeadline();
        refs.add(entry.object_key);
      }
      return refs;
    });
  }
  /** Keep backup memory proportional to compressed history, not expanded 90-day rows. */
  async backupRepresentation() {
    return this.consistentRead(async () => {
      const snapshot = {} as import("./repository.js").Snapshot;
      for (const table of [
        "vessels",
        "anomaly_events",
        "detected_stops",
        "track_archives",
        "sanctions",
        "import_states",
      ] as const) {
        if (table === "track_archives") {
          snapshot.track_archives = [];
          for await (const row of super.iterateArchives())
            snapshot.track_archives.push(row);
        } else (snapshot as any)[table] = await super.all(table);
      }
      const groups: MetadataGroup[] = [];
      for (const kind of GROUP_KINDS)
        for await (const group of this.groups(kind)) {
          decodeGroup(group);
          groups.push(group);
        }
      return { snapshot, metadata_groups: groups };
    });
  }
  private async consistentRead<T>(
    action: () => Promise<T>,
    mmsi?: string,
  ): Promise<T> {
    const revision = () =>
      mmsi
        ? this.client.rpc("metadata_vessel_revision_beta", {
            vessel_mmsi: mmsi,
          })
        : this.client.rpc("metadata_revision_beta");
    for (let attempt = 0; attempt < 3; attempt++) {
      const before = checked(await revision());
      const result = await action();
      const after = checked(await revision());
      if (before === after) return result;
    }
    throw new Error("METADATA_CONCURRENT_RETRY");
  }

  async *groups(
    kind: GroupKind,
    mmsi?: string,
    fromMonth?: string,
  ): AsyncGenerator<MetadataGroup> {
    let cursor: MetadataGroup | undefined;
    for (;;) {
      let q = this.client
        .from("metadata_groups")
        .select("*")
        .eq("kind", kind)
        .order("mmsi")
        .order("month")
        .limit(25);
      if (mmsi) q = q.eq("mmsi", mmsi);
      if (fromMonth) q = q.gte("month", fromMonth);
      if (cursor)
        q = q.or(
          `mmsi.gt.${cursor.mmsi},and(mmsi.eq.${cursor.mmsi},month.gt.${cursor.month})`,
        );
      const page = checked(await q) as MetadataGroup[];
      for (const g of page) yield g;
      if (page.length < 25) return;
      cursor = page.at(-1);
    }
  }
  private async group(kind: GroupKind, mmsi: string, month: string) {
    return checked(
      await this.client
        .from("metadata_groups")
        .select("*")
        .eq("kind", kind)
        .eq("mmsi", mmsi)
        .eq("month", month)
        .maybeSingle(),
    ) as MetadataGroup | null;
  }
  private commitArgs(
    g: MetadataGroup,
    previous: string | null,
    hot: MetadataRow[],
  ) {
    const decoded = g.row_count ? decodeGroup(g) : [];
    if (
      hot.some(
        (row) =>
          !decoded.some(
            (r) =>
              rowKey(g.kind, r) === rowKey(g.kind, row) &&
              isDeepStrictEqual(r, row),
          ),
      )
    )
      throw new Error("METADATA_ROUNDTRIP_FAILED");
    const { payload, ...meta } = g;
    return {
      g: { ...meta, payload_hex: payload.slice(2) },
      previous_checksum: previous,
      expected_rows: hot,
    };
  }
  private async commit(
    g: MetadataGroup,
    previous: string | null,
    hot: MetadataRow[],
  ) {
    return checked(
      await this.client.rpc(
        "apply_metadata_group_beta",
        this.commitArgs(g, previous, hot),
      ),
    ) as boolean;
  }
  private async *coldArchives(
    mmsi?: string,
    fromDay?: string,
  ): AsyncGenerator<ArchiveEntry> {
    for await (const g of this.groups(
      "track_archives",
      mmsi,
      fromDay ? fromDay.slice(0, 7) + "-01" : undefined,
    )) {
      for (const row of decodeGroup(g).sort((a, b) =>
        a.day.localeCompare(b.day),
      ))
        if (!fromDay || row.day >= fromDay) yield row as ArchiveEntry;
    }
  }
  override async *iterateArchives(): AsyncGenerator<ArchiveEntry> {
    const hot = super.iterateArchives()[Symbol.asyncIterator](),
      cold = this.coldArchives()[Symbol.asyncIterator]();
    let a = await hot.next(),
      b = await cold.next();
    const key = (r: ArchiveEntry) => r.mmsi + ":" + r.day;
    while (!a.done || !b.done) {
      if (b.done || (!a.done && key(a.value) < key(b.value))) {
        yield a.value!;
        a = await hot.next();
      } else if (a.done || key(b.value) < key(a.value)) {
        yield b.value!;
        b = await cold.next();
      } else {
        yield a.value!;
        a = await hot.next();
        b = await cold.next();
      }
    }
  }

  override async archives(mmsi?: string, fromDay?: string) {
    return this.consistentRead(() => this.readArchives(mmsi, fromDay), mmsi);
  }
  override async stops(mmsi?: string) {
    return this.consistentRead(() => this.readStops(mmsi), mmsi);
  }
  override async anomalies(mmsi: string): Promise<AnomalyEvent[]> {
    return this.consistentRead(async () => {
      const rows = new Map<string, MetadataRow>();
      for await (const g of this.groups("anomaly_events", mmsi))
        for (const r of decodeGroup(g))
          if (Date.parse(r.detected_at) >= Date.now() - 90 * 86400000)
            rows.set(rowKey("anomaly_events", r), r);
      for (const r of await super.anomalies(mmsi)) rows.set(String(r.id), r);
      return [...rows.values()]
        .sort((a, b) => Date.parse(b.detected_at) - Date.parse(a.detected_at))
        .slice(0, 100)
        .map((r) => ({
          ...r,
          id: r.event_key ?? String(r.id),
        })) as AnomalyEvent[];
    }, mmsi);
  }
  override async nearbyStops(lat: number, lon: number) {
    return this.consistentRead(() => this.readNearbyStops(lat, lon));
  }
  override async all<T>(table: Table): Promise<T[]> {
    return table === "track_archives" ||
      table === "detected_stops" ||
      table === "anomaly_events"
      ? this.consistentRead(() => this.readAll<T>(table))
      : super.all<T>(table);
  }
  private async readArchives(mmsi?: string, fromDay?: string) {
    const out = new Map<string, ArchiveEntry>();
    for await (const row of this.coldArchives(mmsi, fromDay))
      out.set(rowKey("track_archives", row), row);
    for (const row of await super.archives(mmsi, fromDay))
      out.set(rowKey("track_archives", row), row);
    return [...out.values()].sort((a, b) =>
      (a.mmsi + ":" + a.day).localeCompare(b.mmsi + ":" + b.day),
    );
  }
  private async readAll<T>(table: Table): Promise<T[]> {
    if (table === "track_archives") {
      const rows: T[] = [];
      for await (const e of this.iterateArchives()) rows.push(e as T);
      return rows;
    }
    const hot = await super.all<T>(table);
    if (table !== "detected_stops" && table !== "anomaly_events") return hot;
    const out = new Map<string, T>();
    for await (const g of this.groups(table))
      for (const row of decodeGroup(g)) out.set(rowKey(table, row), row as T);
    for (const row of hot) out.set(rowKey(table, row as MetadataRow), row);
    return [...out.values()];
  }
  private async readStops(mmsi?: string) {
    const out = new Map<string, PortCall>();
    const cutoff = Date.now() - 90 * 86400000;
    for await (const g of this.groups("detected_stops", mmsi))
      for (const r of decodeGroup(g))
        if (
          !r.departed_at ||
          Math.max(
            Date.parse(r.arrived_at),
            Date.parse(r.departed_at),
            Date.parse(r.last_seen_at ?? r.arrived_at),
          ) >= cutoff
        )
          out.set(String(r.id), r as PortCall);
    for (const r of await super.stops(mmsi)) out.set(String(r.id), r);
    return [...out.values()].sort(
      (a, b) =>
        b.arrived_at.localeCompare(a.arrived_at) ||
        String(a.id).localeCompare(String(b.id)),
    );
  }
  private async readNearbyStops(lat: number, lon: number) {
    const out = new Map<string, PortCall>();
    for (const s of await super.nearbyStops(lat, lon)) out.set(String(s.id), s);
    const latSpan = 500 / 110000,
      lonSpan = latSpan / Math.cos((lat * Math.PI) / 180),
      cutoff = Date.now() - 90 * 86400000;
    for (let offset = 0; ; offset += 25) {
      const page = checked(
        await this.client
          .rpc("nearby_metadata_groups_beta", {
            query_lat: lat,
            query_lon: lon,
            lat_span: latSpan,
            lon_span: lonSpan,
          })
          .range(offset, offset + 24),
      ) as MetadataGroup[];
      for (const g of page) {
        const sorted = [...out.values()].sort((a, b) =>
          b.arrived_at.localeCompare(a.arrived_at),
        );
        if (
          sorted.length >= 51 &&
          Date.parse(g.max_arrived_at!) < Date.parse(sorted[50].arrived_at)
        )
          return sorted.slice(0, 51);
        for (const r of decodeGroup(g))
          if (
            Math.max(
              Date.parse(r.arrived_at),
              Date.parse(r.departed_at ?? r.arrived_at),
              Date.parse(r.last_seen_at ?? r.arrived_at),
            ) >= cutoff &&
            getDistance(
              { latitude: lat, longitude: lon },
              { latitude: r.port_lat, longitude: r.port_lon },
            ) <= 500 &&
            !out.has(String(r.id))
          )
            out.set(String(r.id), r as PortCall);
      }
      if (page.length < 25) break;
    }
    return [...out.values()]
      .sort(
        (a, b) =>
          b.arrived_at.localeCompare(a.arrived_at) ||
          String(a.id).localeCompare(String(b.id)),
      )
      .slice(0, 51);
  }
  // All open stops and stops ending within seven days stay hot: the 48h port query remains indexed.
  override async portAreaStops(lat: number, lon: number, radius: number) {
    return super.portAreaStops(lat, lon, radius);
  }
  override async deleteArchive(entry: ArchiveEntry) {
    await super.deleteArchive(entry);
    for (let attempt = 0; attempt < 3; attempt++) {
      const g = await this.group(
        "track_archives",
        entry.mmsi,
        rowMonth("track_archives", entry),
      );
      if (!g) return;
      const original = decodeGroup(g),
        rows = original.filter(
          (r) => r.day !== entry.day || r.checksum !== entry.checksum,
        );
      if (rows.length === original.length) return;
      if (
        await this.commit(
          encodeGroup(g.kind, g.mmsi, g.month, rows),
          g.checksum,
          [],
        )
      )
        return;
    }
    throw new Error("METADATA_CONCURRENT_RETRY");
  }
  async compact(now = Date.now(), maxMs = 20 * 60000) {
    const deadline = Date.now() + maxMs,
      cutoff = new Date(now - 7 * 86400000).toISOString();
    let moved = 0;
    for (const kind of GROUP_KINDS) {
      for (;;) {
        if (Date.now() > deadline) return { complete: false, moved };
        let q = this.client.from(kind).select("*").order("mmsi").limit(500);
        q =
          kind === "track_archives"
            ? q.lt("day", cutoff.slice(0, 10)).order("day")
            : kind === "anomaly_events"
              ? q.lt("detected_at", cutoff).order("id")
              : q
                  .lt("arrived_at", cutoff)
                  .lt("departed_at", cutoff)
                  .lt("last_seen_at", cutoff)
                  .order("arrived_at");
        const hot = checked(await q) as MetadataRow[];
        if (!hot.length) break;
        const batches = new Map<string, MetadataRow[]>();
        for (const r of hot) {
          const key = r.mmsi + ":" + rowMonth(kind, r);
          if (!batches.has(key)) batches.set(key, []);
          batches.get(key)!.push(r);
        }
        const work = [...batches.values()];
        for (let offset = 0; offset < work.length; offset += 8) {
          if (Date.now() > deadline) return { complete: false, moved };
          const changes = await Promise.all(
            work.slice(offset, offset + 8).map(async (rows) => {
              const mmsi = String(rows[0].mmsi),
                month = rowMonth(kind, rows[0]),
                g = await this.group(kind, mmsi, month),
                combined = new Map<string, MetadataRow>();
              if (g)
                for (const r of decodeGroup(g))
                  combined.set(rowKey(kind, r), r);
              for (const r of rows) combined.set(rowKey(kind, r), r);
              return this.commitArgs(
                encodeGroup(kind, mmsi, month, [...combined.values()]),
                g?.checksum ?? null,
                rows,
              );
            }),
          );
          let chunk: typeof changes = [];
          const drain = async () => {
            if (!chunk.length) return;
            if (
              !checked(
                await this.client.rpc("apply_metadata_groups_batch_beta", {
                  changes: chunk,
                }),
              )
            )
              throw new Error("METADATA_CONCURRENT_RETRY");
            moved += chunk.reduce((n, c) => n + c.expected_rows.length, 0);
            chunk = [];
          };
          for (const change of changes) {
            if (
              chunk.length &&
              Buffer.byteLength(JSON.stringify([...chunk, change])) > 256 * 1024
            )
              await drain();
            chunk.push(change);
          }
          await drain();
        }
        console.info(
          JSON.stringify({ event: "metadata_compaction_batch", moved, kind }),
        );
      }
    }
    return { complete: true, moved };
  }
  override async prune(before: string) {
    await super.prune(before);
    for (const kind of GROUP_KINDS)
      for await (const g of this.groups(kind)) {
        const original = decodeGroup(g),
          rows = original.filter((r) =>
            kind === "track_archives"
              ? Date.parse(r.last_at) >= Date.parse(before)
              : kind === "anomaly_events"
                ? Date.parse(r.detected_at) >= Date.parse(before)
                : !r.departed_at ||
                  Math.max(
                    Date.parse(r.arrived_at),
                    Date.parse(r.departed_at),
                    Date.parse(r.last_seen_at ?? r.arrived_at),
                  ) >= Date.parse(before),
          );
        if (
          rows.length !== original.length &&
          !(await this.commit(
            encodeGroup(kind, g.mmsi, g.month, rows),
            g.checksum,
            [],
          ))
        )
          throw new Error("METADATA_CONCURRENT_RETRY");
      }
  }
  override async health() {
    await super.health();
    checked(await this.client.from("metadata_groups").select("mmsi").limit(1));
  }
  override async metrics() {
    return checked(
      await this.client.rpc("storage_metrics_compact_beta"),
    ) as Awaited<ReturnType<PostgresRepository["metrics"]>>;
  }
}

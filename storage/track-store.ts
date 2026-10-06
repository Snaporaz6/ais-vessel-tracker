import {
  mkdirSync,
  readdirSync,
  readFileSync,
  appendFileSync,
  unlinkSync,
  openSync,
  readSync,
  closeSync,
  fstatSync,
  ftruncateSync,
  fsyncSync,
} from "node:fs";
import { join } from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { StringDecoder } from "node:string_decoder";
import type { Repository } from "./repository.js";
import type { ObjectStore } from "./object-store.js";
import { checksum } from "./object-store.js";
import { atomicWrite, type DiskBudget } from "./durable.js";
import { compactPositions, mergePositions } from "../shared/history.js";
import {
  ARCHIVE_CACHE_BYTES,
  RETENTION_DAYS,
  HISTORY_TIERS,
} from "../shared/config.js";
import type { ArchiveEntry, VesselPosition } from "../shared/types.js";
import { retainedBackupReferences } from "./backup.js";

const MAX_FILE_BYTES = 64 * 1024 * 1024;
const MAX_WINDOW_POINTS = 100_000;

function* spoolLines(path: string): Generator<string> {
  const fd = openSync(path, "r"),
    buffer = Buffer.alloc(64 * 1024);
  const decoder = new StringDecoder("utf8");
  let tail = "";
  try {
    for (;;) {
      const bytes = readSync(fd, buffer, 0, buffer.length, null);
      if (!bytes) break;
      const parts = (tail + decoder.write(buffer.subarray(0, bytes))).split(
        "\n",
      );
      tail = parts.pop()!;
      if (tail.length > 1024 * 1024) throw new Error("SPOOL_LINE_TOO_LARGE");
      for (const line of parts) if (line) yield line;
    }
    if (tail) throw new Error("SPOOL_INCOMPLETE_LINE");
  } finally {
    closeSync(fd);
  }
}

export class TrackStore {
  readonly dir: string;
  private flushing = false;
  private cache = new Map<
    string,
    { bytes: number; points: VesselPosition[] }
  >();
  private cacheBytes = 0;
  private summary:
    | { latest: Map<string, VesselPosition>; first_at: string | null }
    | undefined;
  lastFlush: string | null = null;
  lastError: string | null = null;
  constructor(
    root: string,
    readonly repo: Repository,
    readonly objects: ObjectStore,
    readonly budget: DiskBudget,
  ) {
    this.dir = join(root, "spool");
    mkdirSync(this.dir, { recursive: true });
    // A process terminated during a write can leave one incomplete line. Quarantine it;
    // complete, fsynced observations remain readable and are never discarded.
    for (const file of this.files()) {
      const path = join(this.dir, file),
        fd = openSync(path, "r+");
      try {
        const size = fstatSync(fd).size;
        if (!size) continue;
        const tail = Buffer.alloc(Math.min(size, 1024 * 1024));
        readSync(fd, tail, 0, tail.length, size - tail.length);
        if (tail.at(-1) === 10) continue;
        const newline = tail.lastIndexOf(10);
        if (newline < 0 && size > tail.length)
          throw new Error("SPOOL_LINE_TOO_LARGE");
        const end = size - tail.length + newline + 1;
        atomicWrite(path + ".partial", tail.subarray(newline + 1));
        ftruncateSync(fd, end);
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
    }
  }
  private files() {
    return readdirSync(this.dir).filter((s) =>
      /^[1-9]\d{8}_\d{4}-\d{2}-\d{2}\.jsonl$/.test(s),
    );
  }
  append(pos: VesselPosition) {
    if (
      !/^[1-9]\d{8}$/.test(pos.mmsi) ||
      !Number.isFinite(Date.parse(pos.timestamp))
    )
      throw new Error("INVALID_POSITION");
    const line = JSON.stringify(pos) + "\n";
    this.budget.check(Buffer.byteLength(line));
    appendFileSync(
      join(this.dir, `${pos.mmsi}_${pos.timestamp.slice(0, 10)}.jsonl`),
      line,
      { flush: true },
    );
    this.budget.bytes += Buffer.byteLength(line);
    if (this.summary) {
      if (!this.summary.first_at || pos.timestamp < this.summary.first_at)
        this.summary.first_at = pos.timestamp;
      if (
        !this.summary.latest.has(pos.mmsi) ||
        pos.timestamp > this.summary.latest.get(pos.mmsi)!.timestamp
      )
        this.summary.latest.set(pos.mmsi, pos);
    }
  }
  pendingSummary() {
    if (this.summary) return this.summary;
    const latest = new Map<string, VesselPosition>();
    let first_at: string | null = null;
    for (const file of this.files())
      for (const line of spoolLines(join(this.dir, file))) {
        const p = JSON.parse(line) as VesselPosition;
        if (
          p.mmsi !== file.slice(0, 9) ||
          !Number.isFinite(Date.parse(p.timestamp))
        )
          throw new Error("SPOOL_INVALID");
        if (first_at === null || p.timestamp < first_at) first_at = p.timestamp;
        if (!latest.has(p.mmsi) || p.timestamp > latest.get(p.mmsi)!.timestamp)
          latest.set(p.mmsi, p);
      }
    this.summary = { latest, first_at };
    return this.summary;
  }
  pending(mmsi?: string, from?: string, to?: string): VesselPosition[] {
    const out: VesselPosition[] = [];
    for (const file of this.files())
      if (!mmsi || file.startsWith(mmsi + "_")) {
        if (from && file.slice(10, 20) < from.slice(0, 10)) continue;
        if (to && file.slice(10, 20) > to.slice(0, 10)) continue;
        for (const line of spoolLines(join(this.dir, file))) {
          const p = JSON.parse(line) as VesselPosition;
          if ((!from || p.timestamp >= from) && (!to || p.timestamp <= to)) {
            if (out.length >= MAX_WINDOW_POINTS)
              throw new Error("TRACK_WINDOW_TOO_LARGE");
            out.push(p);
          }
        }
      }
    return mergePositions(out);
  }
  async decode(e: ArchiveEntry): Promise<VesselPosition[]> {
    const cached = this.cache.get(e.object_key);
    if (cached) {
      this.cache.delete(e.object_key);
      this.cache.set(e.object_key, cached);
      return cached.points;
    }
    const data = await this.objects.get(e.object_key);
    if (checksum(data) !== e.checksum)
      throw new Error("ARCHIVE_CHECKSUM_MISMATCH");
    const points = JSON.parse(
      gunzipSync(data, { maxOutputLength: MAX_FILE_BYTES }).toString(),
    ) as VesselPosition[];
    if (
      !Array.isArray(points) ||
      points.length > MAX_WINDOW_POINTS ||
      points.length !== e.point_count ||
      points.some(
        (p) => p.mmsi !== e.mmsi || p.timestamp.slice(0, 10) !== e.day,
      )
    )
      throw new Error("ARCHIVE_INVALID");
    const bytes = Buffer.byteLength(JSON.stringify(points));
    while (this.cache.size && this.cacheBytes + bytes > ARCHIVE_CACHE_BYTES) {
      const key = this.cache.keys().next().value!;
      this.cacheBytes -= this.cache.get(key)!.bytes;
      this.cache.delete(key);
    }
    if (bytes <= ARCHIVE_CACHE_BYTES) {
      this.cache.set(e.object_key, { bytes, points });
      this.cacheBytes += bytes;
    }
    return points;
  }
  async read(mmsi: string, from: string, to = new Date().toISOString()) {
    const entries = await this.repo.archives(mmsi, from.slice(0, 10)),
      arrays: VesselPosition[][] = [this.pending(mmsi, from, to)];
    let count = arrays[0].length;
    // Sequential reads bound memory/egress instead of fetching ninety objects simultaneously.
    for (const entry of entries) {
      if (entry.day > to.slice(0, 10)) continue;
      const points = (await this.decode(entry)).filter(
        (p) => p.timestamp >= from && p.timestamp <= to,
      );
      count += points.length;
      if (count > MAX_WINDOW_POINTS) throw new Error("TRACK_WINDOW_TOO_LARGE");
      arrays.push(points);
    }
    return mergePositions(...arrays).filter(
      (p) => p.timestamp >= from && p.timestamp <= to,
    );
  }
  async flush(now = Date.now(), maintenance = false) {
    if (this.flushing) return;
    this.flushing = true;
    try {
      const files = this.files();
      const flushFile = async (file: string, old?: ArchiveEntry) => {
        const path = join(this.dir, file),
          mmsi = file.slice(0, 9),
          day = file.slice(10, 20);
        let snapshot = Buffer.alloc(0);
        try {
          const fd = openSync(path, "r");
          try {
            if (fstatSync(fd).size > MAX_FILE_BYTES)
              throw new Error("SPOOL_DAY_TOO_LARGE");
          } finally {
            closeSync(fd);
          }
          snapshot = readFileSync(path);
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
        }
        const pending = snapshot
          .toString()
          .split("\n")
          .filter(Boolean)
          .map((line) => JSON.parse(line) as VesselPosition);
        if (pending.length > MAX_WINDOW_POINTS)
          throw new Error("SPOOL_DAY_TOO_LARGE");
        const previous = old ? await this.decode(old) : [];
        const cutoff = new Date(now - RETENTION_DAYS * 86400_000).toISOString();
        const points = compactPositions(
          mergePositions(previous, pending).filter(
            (p) => p.timestamp >= cutoff,
          ),
          now,
        );
        if (points.length) {
          const data = gzipSync(JSON.stringify(points)),
            sha = checksum(data),
            key = `tracks/${mmsi}/${day}/${sha}.json.gz`;
          if (!old || sha !== old.checksum) {
            await this.objects.put(key, data);
            // Verify the actual uploaded content, not just the optimistic response from PUT.
            if (checksum(await this.objects.get(key)) !== sha)
              throw new Error("ARCHIVE_UPLOAD_UNVERIFIED");
            const e: ArchiveEntry = {
              mmsi,
              day,
              object_key: key,
              checksum: sha,
              point_count: points.length,
              compressed_bytes: data.length,
              first_at: points[0].timestamp,
              last_at: points.at(-1)!.timestamp,
              interval_seconds:
                HISTORY_TIERS.find(
                  (t) =>
                    now - Date.parse(points[0].timestamp) <=
                    t.maxAgeDays * 86400_000,
                )?.intervalSeconds ?? 7200,
              updated_at: new Date(now).toISOString(),
              last_position: points.at(-1)!,
            };
            await this.repo.upsert("track_archives", [e]);
          }
        } else if (old) await this.repo.deleteArchive(old);
        // New observations may have arrived while the upload was in flight.
        // Read and rewrite synchronously so no append can slip between these operations.
        if (snapshot.length) {
          const current = readFileSync(path);
          if (!current.subarray(0, snapshot.length).equals(snapshot))
            throw new Error("SPOOL_CHANGED");
          const tail = current.subarray(snapshot.length);
          if (tail.length) atomicWrite(path, tail);
          else unlinkSync(path);
          this.budget.bytes -= snapshot.length;
        }
      };
      for (const file of files) {
        const old = (
          await this.repo.archives(file.slice(0, 9), file.slice(10, 20))
        ).find((e) => e.day === file.slice(10, 20));
        await flushFile(file, old);
      }
      if (maintenance)
        for await (const old of this.repo.iterateArchives())
          await flushFile(`${old.mmsi}_${old.day}.jsonl`, old);
      this.lastFlush = new Date(now).toISOString();
      this.lastError = null;
      this.summary = undefined;
      if (maintenance) {
        const referenced = new Set<string>();
        for await (const e of this.repo.iterateArchives())
          referenced.add(e.object_key);
        for (const key of await retainedBackupReferences(this.objects, now))
          referenced.add(key);
        // Keep superseded objects for a full day so readers and recent backups can finish.
        for await (const obj of this.objects.list("tracks/"))
          if (
            !referenced.has(obj.key) &&
            now - obj.modified.getTime() > 24 * 3600_000
          )
            await this.objects.delete(obj.key);
        await this.repo.prune(
          new Date(now - RETENTION_DAYS * 86400_000).toISOString(),
        );
      }
    } catch (e) {
      this.lastError = "ARCHIVE_UNAVAILABLE";
      throw e;
    } finally {
      this.flushing = false;
    }
  }
}

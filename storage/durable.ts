import {
  mkdirSync,
  writeFileSync,
  renameSync,
  openSync,
  fsyncSync,
  closeSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  statSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type { Repository, Table } from "./repository.js";
import { SPOOL_LIMIT_BYTES } from "../shared/config.js";

export function atomicWrite(path: string, data: string | Buffer) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = path + ".tmp";
  writeFileSync(tmp, data, { flush: true });
  renameSync(tmp, path);
  const fd = openSync(dirname(path), "r");
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}
export function readJSON<T>(path: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw new Error("DURABLE_STATE_CORRUPT");
  }
}
export class DiskBudget {
  bytes = 0;
  constructor(
    readonly root: string,
    readonly limit = SPOOL_LIMIT_BYTES,
  ) {
    mkdirSync(root, { recursive: true });
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else this.bytes += statSync(path).size;
      }
    };
    walk(root);
  }
  check(extra: number) {
    if (this.bytes + extra > this.limit)
      throw new Error("PERSISTENT_VOLUME_FULL");
  }
  rescan() {
    let bytes = 0;
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, e.name);
        if (e.isDirectory()) walk(path);
        else bytes += statSync(path).size;
      }
    };
    walk(this.root);
    this.bytes = bytes;
  }
}
export class DurableOutbox {
  readonly dir: string;
  lastError: string | null = null;
  private flushing = false;
  private sequence = 0;
  constructor(
    root: string,
    readonly repo: Repository,
    readonly budget: DiskBudget,
  ) {
    this.dir = join(root, "outbox");
    mkdirSync(this.dir, { recursive: true });
  }
  enqueue(table: Table, row: unknown) {
    const data = JSON.stringify({ table, row });
    this.budget.check(Buffer.byteLength(data));
    atomicWrite(
      join(
        this.dir,
        `${Date.now()}-${String(this.sequence++).padStart(12, "0")}-${randomUUID()}.json`,
      ),
      data,
    );
    this.budget.bytes += Buffer.byteLength(data);
  }
  get pending() {
    return readdirSync(this.dir).filter((x) => x.endsWith(".json")).length;
  }
  get oldestPendingAt() {
    const first = readdirSync(this.dir)
      .filter((x) => x.endsWith(".json"))
      .sort()[0];
    return first ? Number(first.split("-")[0]) : null;
  }
  *records() {
    for (const file of readdirSync(this.dir)
      .filter((x) => x.endsWith(".json"))
      .sort())
      yield JSON.parse(readFileSync(join(this.dir, file), "utf8")) as {
        table: Table;
        row: unknown;
      };
  }
  async flush() {
    if (this.flushing) return;
    this.flushing = true;
    try {
      // Ordered delivery prevents delayed static updates from overwriting newer metadata.
      const files = readdirSync(this.dir)
        .filter((x) => x.endsWith(".json"))
        .sort();
      for (let start = 0; start < files.length; start += 400) {
        const batch = files.slice(start, start + 400).map((file) => {
          const path = join(this.dir, file),
            raw = readFileSync(path, "utf8");
          return { path, raw, ...JSON.parse(raw) } as {
            path: string;
            raw: string;
            table: Table;
            row: Record<string, unknown>;
          };
        });
        const groups = new Map<Table, Map<string, Record<string, unknown>>>();
        for (const item of batch) {
          let group = groups.get(item.table);
          if (!group) {
            group = new Map();
            groups.set(item.table, group);
          }
          const key =
            item.table === "vessels"
              ? String(item.row.mmsi)
              : item.table === "anomaly_events"
                ? String(item.row.event_key)
                : String(item.row.id ?? item.row.source);
          group.set(key, item.row);
        }
        for (const [table, rows] of groups)
          await this.repo.upsert(table, [...rows.values()]);
        for (const item of batch) {
          unlinkSync(item.path);
          this.budget.bytes -= Buffer.byteLength(item.raw);
        }
      }
      this.lastError = null;
    } catch (error) {
      this.lastError = "DATABASE_DELIVERY_FAILED";
      throw error;
    } finally {
      this.flushing = false;
    }
  }
}

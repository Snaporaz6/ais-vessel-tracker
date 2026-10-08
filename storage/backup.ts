import { gzipSync, gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { TABLES, type Repository, type Snapshot } from "./repository.js";
import { checksum, type ObjectStore } from "./object-store.js";
import { atomicWrite, readJSON } from "./durable.js";
export interface Backup {
  version: 1;
  created_at: string;
  snapshot: Snapshot;
}
export interface RestoreOptions {
  sessionPath: string;
  /** Stable identity of the isolated destination, never a credential. */
  target: string;
}
interface RestoreSession {
  version: 1;
  backup_sha256: string;
  target: string;
  created_at: string;
  phase: "restoring" | "complete";
  verified_tables: string[];
}

function restoreRows(table: (typeof TABLES)[number], rows: unknown[]) {
  if (table === "anomaly_events")
    return rows.map((record) => {
      const { id, ...r } = record as Record<string, unknown>;
      const hex = createHash("sha256")
        .update(`legacy:${id}:${r.mmsi}:${r.detected_at}`)
        .digest("hex")
        .slice(0, 32);
      return {
        ...r,
        event_key:
          r.event_key ??
          `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`,
      };
    });
  if (table === "sanctions")
    return rows.map((record) => {
      const { id, ...r } = record as Record<string, unknown>;
      return r;
    });
  return rows;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}

/** Compare full rows, including duplicate sanctions, without local serial IDs. */
function remainingRows(expected: unknown[], existing: unknown[]) {
  const fingerprints = new Map<string, unknown[]>();
  for (const row of expected) {
    const fingerprint = JSON.stringify(canonical(row));
    const rows = fingerprints.get(fingerprint) ?? [];
    rows.push(row);
    fingerprints.set(fingerprint, rows);
  }
  for (const row of existing) {
    const fingerprint = JSON.stringify(canonical(row));
    const rows = fingerprints.get(fingerprint);
    if (!rows?.length) throw new Error("RESTORE_TARGET_CONTENT_MISMATCH");
    rows.pop();
  }
  return [...fingerprints.values()].flat();
}
export async function backup(repo: Repository, objects: ObjectStore) {
  const snapshot = {} as Snapshot;
  for (const table of TABLES) (snapshot as any)[table] = await repo.all(table);
  const value: Backup = {
      version: 1,
      created_at: new Date().toISOString(),
      snapshot,
    },
    data = gzipSync(JSON.stringify(value)),
    sha = checksum(data),
    key = `backups/${value.created_at.replace(/[:.]/g, "-")}-${sha}.json.gz`;
  await objects.put(key, data);
  if (checksum(await objects.get(key)) !== sha)
    throw new Error("BACKUP_UNVERIFIED");
  return {
    key,
    checksum: sha,
    bytes: data.length,
    created_at: value.created_at,
  };
}
export function decodeBackup(data: Buffer, expected: string): Backup {
  if (checksum(data) !== expected) throw new Error("BACKUP_CHECKSUM_MISMATCH");
  const value = JSON.parse(gunzipSync(data).toString()) as Backup;
  if (
    value.version !== 1 ||
    TABLES.some((t) => !Array.isArray(value.snapshot[t]))
  )
    throw new Error("BACKUP_INVALID");
  return value;
}
export async function restore(
  repo: Repository,
  objects: ObjectStore,
  data: Buffer,
  sha: string,
  options?: RestoreOptions,
) {
  const value = decodeBackup(data, sha);
  // Validate every referenced track and the empty target before the first database write.
  for (const e of value.snapshot.track_archives)
    if (checksum(await objects.get(e.object_key)) !== e.checksum)
      throw new Error("BACKUP_TRACK_MISSING");
  const session = options
    ? readJSON<RestoreSession | null>(options.sessionPath, null)
    : null;
  if (
    session &&
    (session.version !== 1 ||
      session.backup_sha256 !== sha ||
      session.target !== options!.target ||
      !["restoring", "complete"].includes(session.phase) ||
      !Array.isArray(session.verified_tables))
  )
    throw new Error("RESTORE_SESSION_MISMATCH");
  const expected = Object.fromEntries(
    TABLES.map((table) => [table, restoreRows(table, value.snapshot[table])]),
  ) as Record<(typeof TABLES)[number], unknown[]>;
  // Before any write, a new destination must be empty. A resumed destination
  // may contain only exact rows from this backup, never unrelated/newer data.
  for (const table of TABLES) {
    const existing = await repo.all(table);
    if (!session && existing.length)
      throw new Error("RESTORE_REQUIRES_EMPTY_TARGET");
    if (session) {
      const remaining = remainingRows(
        expected[table],
        restoreRows(table, existing),
      );
      if (session.phase === "complete" && remaining.length)
        throw new Error("RESTORE_TARGET_CONTENT_MISMATCH");
    }
  }
  if (session?.phase === "complete") return value;
  const state: RestoreSession = session ?? {
    version: 1,
    backup_sha256: sha,
    target: options?.target ?? "",
    created_at: new Date().toISOString(),
    phase: "restoring",
    verified_tables: [],
  };
  const saveSession = () => {
    if (options) atomicWrite(options.sessionPath, JSON.stringify(state));
  };
  saveSession();
  for (const table of TABLES) {
    const missing = remainingRows(
      expected[table],
      restoreRows(table, await repo.all(table)),
    );
    // Reconcile committed rows after an ambiguous request failure. In particular,
    // sanctions have database-generated serial IDs and cannot be blindly replayed.
    await repo.upsert(table, missing);
    if (
      remainingRows(expected[table], restoreRows(table, await repo.all(table)))
        .length
    )
      throw new Error("RESTORE_COUNT_MISMATCH");
    if (!state.verified_tables.includes(table))
      state.verified_tables.push(table);
    saveSession();
  }
  state.phase = "complete";
  saveSession();
  return value;
}
export async function retainedBackupReferences(
  objects: ObjectStore,
  now = Date.now(),
) {
  const refs = new Set<string>();
  for await (const obj of objects.list("backups/")) {
    if (now - obj.modified.getTime() > 7 * 86400_000) {
      await objects.delete(obj.key);
      continue;
    }
    const data = await objects.get(obj.key),
      value = decodeBackup(
        data,
        obj.key.match(/([a-f0-9]{64})\.json\.gz$/)?.[1] ?? "",
      );
    for (const e of value.snapshot.track_archives) refs.add(e.object_key);
  }
  return refs;
}

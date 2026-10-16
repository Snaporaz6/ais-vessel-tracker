import { gzipSync, gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { TABLES, type Repository, type Snapshot } from "./repository.js";
import { checksum, type ObjectStore } from "./object-store.js";
import { CompactRepository } from "./compact-repository.js";
import { atomicWrite, readJSON } from "./durable.js";
import { canonicalTimestamp } from "../shared/timestamps.js";
import { collectBackupReferences } from "./backup-references.js";
import {
  decodeGroup,
  rowKey,
  GROUP_KINDS,
  type MetadataGroup,
} from "./metadata-groups.js";
export interface Backup {
  version: 1 | 2;
  created_at: string;
  snapshot: Snapshot;
  /** v2 may retain verified compressed groups; v1 and expanded v2 remain readable. */
  metadata_groups?: MetadataGroup[];
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

function restoreRows(
  table: (typeof TABLES)[number],
  rows: unknown[],
  preserveIDs = false,
) {
  if (preserveIDs) return rows;
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
  if (typeof value === "string") return canonicalTimestamp(value);
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
  const representation =
    repo instanceof CompactRepository
      ? await repo.backupRepresentation()
      : null;
  const snapshot = representation?.snapshot ?? ({} as Snapshot);
  if (!representation)
    for (const table of TABLES)
      (snapshot as any)[table] = await repo.all(table);
  const value: Backup = {
      version: repo instanceof CompactRepository ? 2 : 1,
      created_at: new Date().toISOString(),
      snapshot,
      ...(representation
        ? { metadata_groups: representation.metadata_groups }
        : {}),
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
export function decodeBackup(
  data: Buffer,
  expected: string,
  expandGroups = true,
): Backup {
  if (checksum(data) !== expected) throw new Error("BACKUP_CHECKSUM_MISMATCH");
  const value = JSON.parse(gunzipSync(data).toString()) as Backup;
  if (
    ![1, 2].includes(value.version) ||
    TABLES.some((t) => !Array.isArray(value.snapshot[t]))
  )
    throw new Error("BACKUP_INVALID");
  if (value.metadata_groups !== undefined) {
    if (value.version !== 2 || !Array.isArray(value.metadata_groups))
      throw new Error("BACKUP_INVALID");
    const keys = new Set<string>();
    for (const group of value.metadata_groups) {
      const key = group.kind + ":" + group.mmsi + ":" + group.month;
      if (keys.has(key)) throw new Error("BACKUP_INVALID");
      keys.add(key);
      decodeGroup(group);
    }
    if (expandGroups) {
      for (const kind of GROUP_KINDS) {
        const rows = new Map<string, any>();
        for (const group of value.metadata_groups.filter(
          (g) => g.kind === kind,
        ))
          for (const row of decodeGroup(group))
            rows.set(rowKey(kind, row), row);
        for (const row of value.snapshot[kind])
          rows.set(rowKey(kind, row), row);
        (value.snapshot as any)[kind] = [...rows.values()];
      }
    }
  }
  return value;
}
export async function restore(
  repo: Repository,
  objects: ObjectStore,
  data: Buffer,
  sha: string,
  options?: RestoreOptions,
) {
  let value = decodeBackup(data, sha, false);
  const packed =
    value.version === 2 &&
    Array.isArray(value.metadata_groups) &&
    repo.restorePackedGroups &&
    repo.verifyPackedRestore &&
    repo.restoreHotRows;
  if (!packed) value = decodeBackup(data, sha);
  const targetRows = (table: (typeof TABLES)[number]) =>
    packed ? repo.restoreHotRows!(table) : repo.all(table);
  let maximumEventID = 0;
  if (packed)
    for (const g of value.metadata_groups!)
      if (g.kind === "anomaly_events")
        for (const row of decodeGroup(g)) {
          const id = Number(row.id);
          if (!Number.isSafeInteger(id) || id < 1 || id > 2147483646)
            throw new Error("BACKUP_ANOMALY_ID_INVALID");
          maximumEventID = Math.max(maximumEventID, id);
        }
  function* referencedTracks() {
    yield* value.snapshot.track_archives;
    if (packed)
      for (const g of value.metadata_groups!)
        if (g.kind === "track_archives")
          yield* decodeGroup(g) as typeof value.snapshot.track_archives;
  }
  // Validate all referenced tracks in bounded batches before any destination write.
  let pending: Promise<void>[] = [];
  const drain = async () => {
    const results = await Promise.allSettled(pending);
    pending = [];
    const failed = results.find((r) => r.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
  };
  for (const e of referencedTracks()) {
    pending.push(
      (async () => {
        if (checksum(await objects.get(e.object_key)) !== e.checksum)
          throw new Error("BACKUP_TRACK_MISSING");
      })(),
    );
    if (pending.length === 8) await drain();
  }
  await drain();
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
  if (packed)
    await repo.verifyPackedRestore!(
      value.metadata_groups!,
      session
        ? session.phase === "complete"
          ? "complete"
          : "partial"
        : "empty",
    );
  const expected = Object.fromEntries(
    TABLES.map((table) => [
      table,
      restoreRows(table, value.snapshot[table], value.version === 2),
    ]),
  ) as Record<(typeof TABLES)[number], unknown[]>;
  // Before any write, a new destination must be empty. A resumed destination
  // may contain only exact rows from this backup, never unrelated/newer data.
  for (const table of TABLES) {
    const existing = await targetRows(table);
    if (!session && existing.length)
      throw new Error("RESTORE_REQUIRES_EMPTY_TARGET");
    if (session) {
      const remaining = remainingRows(
        expected[table],
        restoreRows(table, existing, value.version === 2),
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
      restoreRows(table, await targetRows(table), value.version === 2),
    );
    // Reconcile committed rows after an ambiguous request failure. In particular,
    // sanctions have database-generated serial IDs and cannot be blindly replayed.
    await repo.upsert(table, missing);
    if (
      remainingRows(
        expected[table],
        restoreRows(table, await targetRows(table), value.version === 2),
      ).length
    )
      throw new Error("RESTORE_COUNT_MISMATCH");
    if (!state.verified_tables.includes(table))
      state.verified_tables.push(table);
    saveSession();
  }
  if (packed) await repo.restorePackedGroups!(value.metadata_groups!);
  if (value.version === 2)
    await repo.finishRestore?.(maximumEventID || undefined);
  state.phase = "complete";
  saveSession();
  return value;
}
export async function retainedBackupReferences(
  objects: ObjectStore,
  now = Date.now(),
  checkDeadline: () => void = () => {},
  refs = new Set<string>(),
) {
  for await (const obj of objects.list("backups/")) {
    checkDeadline();
    if (now - obj.modified.getTime() > 7 * 86400_000) {
      await objects.delete(obj.key);
      continue;
    }
    await collectBackupReferences(
      await objects.get(obj.key),
      obj.key.match(/([a-f0-9]{64})\.json\.gz$/)?.[1] ?? "",
      refs,
      checkDeadline,
    );
  }
  return refs;
}

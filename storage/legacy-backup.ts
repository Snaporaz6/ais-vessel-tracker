import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { Transform, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { StringDecoder } from "node:string_decoder";
import { createGunzip } from "node:zlib";

export const LEGACY_TABLES = [
  "vessels",
  "vessel_positions",
  "sanctions",
  "anomaly_events",
] as const;
export type LegacyTable = (typeof LEGACY_TABLES)[number];
interface TableBackup {
  available: true;
  rows: number;
  backup: { sha256: string; rows: number; bytes: number; verified: true };
}
export interface LegacyBackupManifest {
  at: string;
  verified: true;
  tables: Record<LegacyTable, TableBackup>;
}
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
export const isRowCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

function decodeManifest(value: unknown): LegacyBackupManifest {
  if (
    !record(value) ||
    value.verified !== true ||
    typeof value.at !== "string" ||
    !Number.isFinite(Date.parse(value.at)) ||
    !record(value.tables)
  )
    throw new Error("LEGACY_BACKUP_MANIFEST_INVALID");
  for (const name of LEGACY_TABLES) {
    const table = value.tables[name];
    if (
      !record(table) ||
      table.available !== true ||
      !isRowCount(table.rows) ||
      !record(table.backup) ||
      table.backup.verified !== true ||
      !isRowCount(table.backup.rows) ||
      table.rows !== table.backup.rows ||
      !isRowCount(table.backup.bytes) ||
      typeof table.backup.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(table.backup.sha256)
    )
      throw new Error("LEGACY_BACKUP_MANIFEST_INVALID");
  }
  return value as unknown as LegacyBackupManifest;
}

/** Reread actual compressed files before any import; manifest flags alone are insufficient. */
export async function verifyLegacyBackup(manifestPath: string) {
  const path = resolve(manifestPath),
    manifest = decodeManifest(JSON.parse(await readFile(path, "utf8")));
  for (const table of LEGACY_TABLES) {
    const expected = manifest.tables[table].backup,
      hash = createHash("sha256"),
      decoder = new StringDecoder("utf8");
    let bytes = 0,
      rows = 0,
      remainder = "";
    const accept = (line: string) => {
      if (!line.trim()) return;
      if (!record(JSON.parse(line)))
        throw new Error("LEGACY_BACKUP_ROW_INVALID");
      rows++;
    };
    const consume = (text: string) => {
      remainder += text;
      let end: number;
      while ((end = remainder.indexOf("\n")) !== -1) {
        accept(remainder.slice(0, end));
        remainder = remainder.slice(end + 1);
      }
    };
    await pipeline(
      createReadStream(join(dirname(path), `${table}.jsonl.gz`)),
      new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          bytes += chunk.length;
          hash.update(chunk);
          callback(null, chunk);
        },
      }),
      createGunzip(),
      new Writable({
        write(chunk: Buffer, _encoding, callback) {
          try {
            consume(decoder.write(chunk));
            callback();
          } catch (error) {
            callback(error as Error);
          }
        },
        final(callback) {
          try {
            consume(decoder.end());
            accept(remainder);
            callback();
          } catch (error) {
            callback(error as Error);
          }
        },
      }),
    );
    if (bytes !== expected.bytes || hash.digest("hex") !== expected.sha256)
      throw new Error("LEGACY_BACKUP_CHECKSUM_MISMATCH");
    if (rows !== expected.rows) throw new Error("LEGACY_BACKUP_COUNT_MISMATCH");
  }
  return manifest;
}

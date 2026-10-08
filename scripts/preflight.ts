import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import {
  createWriteStream,
  readFileSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { createGzip, gunzipSync } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { join } from "node:path";
import { checksum } from "../storage/object-store.js";
import { LEGACY_TABLES, isRowCount } from "../storage/legacy-backup.js";
config({ path: process.env.ENV_FILE ?? ".env.local" });
async function main() {
  const url = process.env.SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("DATABASE_SETTINGS_REQUIRED");
  const db = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (u, i) =>
          fetch(u, { ...i, signal: AbortSignal.timeout(20_000) }),
      },
    }),
    backupDir = process.env.LEGACY_BACKUP_DIR,
    report: Record<string, unknown> = {
      at: new Date().toISOString(),
      tables: {},
    };
  let unavailable = 0;
  if (backupDir) mkdirSync(backupDir, { recursive: true });
  for (const table of [
    ...LEGACY_TABLES,
    "track_archives",
    "detected_stops",
    "import_states",
  ]) {
    const { count, error } = await db
      .from(table)
      .select("*", { count: "exact", head: true });
    const legacy = (LEGACY_TABLES as readonly string[]).includes(table);
    if (error || !isRowCount(count)) {
      (report.tables as any)[table] = {
        available: false,
        code: error
          ? error.code || "DATABASE_UNREACHABLE"
          : "COUNT_UNAVAILABLE",
      };
      if (legacy) unavailable++;
      continue;
    }
    (report.tables as any)[table] = { available: true, rows: count };
    if (!backupDir || !legacy) continue;
    const order =
      table === "vessels"
        ? ["mmsi"]
        : table === "vessel_positions"
          ? ["mmsi", "timestamp"]
          : ["id"];
    let saved = 0;
    async function* rows() {
      for (let n = 0; ; n += 500) {
        let q = db.from(table).select("*");
        for (const field of order) q = q.order(field);
        const { data, error } = await q.range(n, n + 499);
        if (error) throw new Error("BACKUP_READ_FAILED");
        for (const row of data ?? []) {
          saved++;
          yield JSON.stringify(row) + "\n";
        }
        if ((data?.length ?? 0) < 500) return;
      }
    }
    const file = join(backupDir, table + ".jsonl.gz");
    await pipeline(
      Readable.from(rows()),
      createGzip(),
      createWriteStream(file),
    );
    const data = readFileSync(file),
      lines = gunzipSync(data).toString().split("\n").filter(Boolean);
    for (const line of lines) JSON.parse(line);
    if (lines.length !== saved || saved !== count)
      throw new Error("BACKUP_COUNT_MISMATCH");
    (report.tables as any)[table].backup = {
      sha256: checksum(data),
      rows: saved,
      bytes: data.length,
      verified: true,
    };
  }
  report.verified = !!backupDir && unavailable === 0;
  if (backupDir)
    writeFileSync(
      join(backupDir, "manifest.json"),
      JSON.stringify(report, null, 2),
    );
  if (process.env.REPORT_FILE)
    writeFileSync(process.env.REPORT_FILE, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  if (unavailable) process.exitCode = 1;
}
void main().catch(() => {
  console.error(
    "Controllo database/backup non riuscito. Nessuna modifica al database.",
  );
  process.exitCode = 1;
});

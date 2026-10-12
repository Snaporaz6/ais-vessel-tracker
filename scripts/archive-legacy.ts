import { canonicalTimestamp } from "../shared/timestamps.js";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { PGlite } from "@electric-sql/pglite";
import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { BucketStore, checksum } from "../storage/object-store.js";
import { runtimeConfig } from "../shared/runtime.js";
config({ path: process.env.ENV_FILE ?? ".env.local" });
const fields = [
  "mmsi",
  "timestamp",
  "lat",
  "lon",
  "speed",
  "course",
  "heading",
  "nav_status",
];
function canonical(row: Record<string, unknown>) {
  return JSON.stringify(
    Object.fromEntries(
      Object.keys(row)
        .sort()
        .map((k) => [
          k,
          k === "timestamp" ? canonicalTimestamp(String(row[k])) : row[k],
        ]),
    ),
  );
}
async function main() {
  const root = process.env.LEGACY_ARCHIVE_DIR;
  if (!root) throw new Error("LEGACY_ARCHIVE_DIR_REQUIRED");
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const cfg = runtimeConfig({ requireAIS: false });
  const db = createClient(cfg.SUPABASE_URL!, cfg.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (u, i) => fetch(u, { ...i, signal: AbortSignal.timeout(30000) }),
    },
  });
  const objects = new BucketStore(cfg);
  async function bounds() {
    const [count, first, last] = await Promise.all([
      db.from("vessel_positions").select("*", { count: "exact", head: true }),
      db
        .from("vessel_positions")
        .select("timestamp")
        .order("timestamp")
        .limit(1),
      db
        .from("vessel_positions")
        .select("timestamp")
        .order("timestamp", { ascending: false })
        .limit(1),
    ]);
    if (count.error || first.error || last.error || count.count === null)
      throw new Error("LEGACY_READ_FAILED");
    return {
      rows: count.count,
      first_at: first.data?.[0]?.timestamp,
      last_at: last.data?.[0]?.timestamp,
    };
  }
  const before = await bounds();
  if (
    !before.rows ||
    Date.parse(before.last_at!) >= Date.parse("2026-03-16T00:00:00Z")
  )
    throw new Error("LEGACY_SCOPE_CHANGED");
  const checkpointPath = join(root, "export-session.json");
  const checkpoint = existsSync(checkpointPath)
    ? JSON.parse(readFileSync(checkpointPath, "utf8"))
    : null;
  if (
    checkpoint &&
    JSON.stringify(checkpoint.source) !== JSON.stringify(before)
  )
    throw new Error("LEGACY_SOURCE_CHANGED");
  const prefix: string =
    checkpoint?.prefix ??
    `legacy/march-2026/${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const schema = readFileSync("scripts/init-db-free-tier.sql", "utf8").match(
    /CREATE TABLE IF NOT EXISTS vessel_positions \([\s\S]*?\);/,
  )?.[0];
  if (!schema) throw new Error("LEGACY_SCHEMA_MISSING");
  const schemaData = Buffer.from(schema);
  writeFileSync(join(root, "schema.sql"), schemaData, { mode: 0o600 });
  await objects.put(prefix + "/schema.sql", schemaData);
  if (
    checksum(await objects.get(prefix + "/schema.sql")) !== checksum(schemaData)
  )
    throw new Error("LEGACY_SCHEMA_UNVERIFIED");
  const hash = createHash("sha256");
  const parts: {
    key: string;
    checksum: string;
    rows: number;
    bytes: number;
  }[] = [];
  let cursor: { mmsi: string; timestamp: string } | undefined,
    rows = 0;
  let pending: string[] = [];
  for (const part of checkpoint?.parts ?? []) {
    const bytes = readFileSync(join(root, part.key.split("/").at(-1)));
    if (
      checksum(bytes) !== part.checksum ||
      checksum(await objects.get(part.key)) !== part.checksum
    )
      throw new Error("LEGACY_RESUME_CORRUPT");
    for (const line of gunzipSync(bytes).toString().trim().split("\n")) {
      hash.update(line + "\n");
      rows++;
      const r = JSON.parse(line);
      cursor = { mmsi: r.mmsi, timestamp: r.timestamp };
    }
    parts.push(part);
  }

  async function savePart() {
    if (!pending.length) return;
    const data = gzipSync(pending.join("\n") + "\n");
    const name = `positions-${String(parts.length).padStart(4, "0")}.jsonl.gz`;
    const key = prefix + "/" + name;
    writeFileSync(join(root!, name), data, { mode: 0o600 });
    await objects.put(key, data);
    if (checksum(await objects.get(key)) !== checksum(data))
      throw new Error("LEGACY_PART_UNVERIFIED");
    parts.push({
      key,
      checksum: checksum(data),
      rows: pending.length,
      bytes: data.length,
    });
    const last = JSON.parse(pending.at(-1)!);
    writeFileSync(
      checkpointPath,
      JSON.stringify({
        source: before,
        prefix,
        parts,
        cursor: { mmsi: last.mmsi, timestamp: last.timestamp },
        rows,
      }),
      { mode: 0o600, flush: true },
    );
    pending = [];
    console.info(
      JSON.stringify({
        event: "legacy_archive_part",
        rows,
        parts: parts.length,
      }),
    );
  }
  for (;;) {
    let q = db
      .from("vessel_positions")
      .select("*")
      .order("mmsi")
      .order("timestamp")
      .limit(1000);
    if (cursor)
      q = q.or(
        `mmsi.gt.${cursor.mmsi},and(mmsi.eq.${cursor.mmsi},timestamp.gt.${cursor.timestamp})`,
      );
    let result = await q;
    for (let attempt = 0; result.error && attempt < 4; attempt++) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      result = await q;
    }
    const { data, error } = result;
    if (error) {
      const code = /^[A-Z0-9]{5}$/.test(error.code ?? "")
        ? error.code
        : "REQUEST_FAILED";
      console.warn(
        JSON.stringify({ event: "legacy_export_failed", code, rows }),
      );
      throw new Error("LEGACY_EXPORT_FAILED");
    }
    for (const row of data ?? []) {
      if (
        Object.keys(row).some((k) => !fields.includes(k)) ||
        fields.some((k) => !(k in row))
      )
        throw new Error("LEGACY_SCHEMA_CHANGED");
      const line = canonical(row);
      hash.update(line + "\n");
      pending.push(line);
      rows++;
      if (pending.length >= 25000) await savePart();
    }
    if (!data?.length || data.length < 1000) break;
    cursor = data.at(-1)!;
  }
  await savePart();
  const after = await bounds();
  if (JSON.stringify(before) !== JSON.stringify(after) || rows !== before.rows)
    throw new Error("LEGACY_SOURCE_CHANGED");
  const expected = hash.digest("hex");
  const isolated = await PGlite.create(join(root, "restore-postgresql"));
  const restoredHash = createHash("sha256");
  let restored = 0;
  try {
    await isolated.exec(schema);
    const existing = await isolated.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM vessel_positions",
    );
    if (existing.rows[0].count)
      throw new Error("LEGACY_RESTORE_TARGET_NOT_EMPTY");
    for (const part of parts) {
      const data = await objects.get(part.key);
      if (checksum(data) !== part.checksum)
        throw new Error("LEGACY_DOWNLOAD_CORRUPT");
      const records = gunzipSync(data)
        .toString()
        .trim()
        .split("\n")
        .map((l) => JSON.parse(l));
      if (records.length !== part.rows)
        throw new Error("LEGACY_PART_COUNT_MISMATCH");
      for (let i = 0; i < records.length; i += 1000) {
        await isolated.query(
          `INSERT INTO vessel_positions SELECT * FROM jsonb_populate_recordset(NULL::vessel_positions,$1::jsonb)`,
          [JSON.stringify(records.slice(i, i + 1000))],
        );
      }
    }
    let key: { mmsi: string; timestamp: string } | undefined;
    for (;;) {
      const r = await isolated.query<{ row: Record<string, unknown> }>(
        `SELECT to_jsonb(p) AS row FROM vessel_positions p ${key ? "WHERE (mmsi,timestamp)>($1,$2::timestamptz)" : ""} ORDER BY mmsi,timestamp LIMIT 1000`,
        key ? [key.mmsi, key.timestamp] : [],
      );
      for (const { row } of r.rows) {
        restoredHash.update(canonical(row) + "\n");
        restored++;
      }
      if (r.rows.length < 1000) break;
      const last = r.rows.at(-1)!.row;
      key = { mmsi: String(last.mmsi), timestamp: String(last.timestamp) };
    }
    if (restored !== rows || restoredHash.digest("hex") !== expected)
      throw new Error("LEGACY_RESTORE_CONTENT_MISMATCH");
    const sample = await isolated.query(
      "SELECT mmsi,min(timestamp) AS first_at,max(timestamp) AS last_at,count(*) FROM vessel_positions GROUP BY mmsi ORDER BY mmsi LIMIT 1",
    );
    const manifest = {
      version: 1,
      created_at: new Date().toISOString(),
      source: before,
      rows,
      schema_sha256: checksum(schemaData),
      canonical_rows_sha256: expected,
      parts,
      restored_rows: restored,
      restore_verified: true,
      sample_query: sample.rows,
      retention: "indefinite-explicit-decision-only",
    };
    const payload = Buffer.from(JSON.stringify(manifest, null, 2));
    writeFileSync(join(root, "manifest.json"), payload, { mode: 0o600 });
    await objects.put(prefix + "/manifest.json", payload);
    if (
      checksum(await objects.get(prefix + "/manifest.json")) !==
      checksum(payload)
    )
      throw new Error("LEGACY_MANIFEST_UNVERIFIED");
    console.info(
      JSON.stringify({
        event: "legacy_archive_verified",
        prefix,
        rows,
        compressed_bytes: parts.reduce((n, p) => n + p.bytes, 0),
        restore_verified: true,
      }),
    );
  } finally {
    await isolated.close();
  }
}
void main().catch(() => {
  console.error(
    "LEGACY_ARCHIVE_FAILED: source data retained; inspect local output and retry with a new directory.",
  );
  process.exitCode = 1;
});

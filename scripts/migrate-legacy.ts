import { createContext } from "../server/context.js";
import { PostgresRepository } from "../storage/repository.js";
import { parseAISMessage } from "../ingestor/parser.js";
import type { VesselPosition } from "../shared/types.js";
import { atomicWrite, readJSON } from "../storage/durable.js";
import { join } from "node:path";
import { verifyLegacyBackup } from "../storage/legacy-backup.js";
async function main() {
  if (
    !process.env.VERIFIED_DATABASE_BACKUP ||
    !process.argv.includes("--apply")
  )
    throw new Error("VERIFIED_BACKUP_REQUIRED");
  await verifyLegacyBackup(process.env.VERIFIED_DATABASE_BACKUP);
  const c = await createContext();
  if (!(c.repo instanceof PostgresRepository))
    throw new Error("DATABASE_REQUIRED");
  const path = join(c.config.storageDir, "legacy-import-checkpoint.json");
  let cursor = readJSON<{
      mmsi: string;
      timestamp: string;
      position?: VesselPosition;
    } | null>(path, null),
    count = 0,
    previous = cursor?.position;
  for (;;) {
    let q = c.repo.client
      .from("vessel_positions")
      .select("*")
      .gte("timestamp", new Date(Date.now() - 90 * 86400_000).toISOString())
      .order("mmsi")
      .order("timestamp")
      .limit(500);
    if (cursor)
      q = q.or(
        `mmsi.gt.${cursor.mmsi},and(mmsi.eq.${cursor.mmsi},timestamp.gt.${cursor.timestamp})`,
      );
    const { data, error } = await q;
    if (error) throw new Error("LEGACY_READ_FAILED");
    if (!data?.length) break;
    for (const row of data) {
      const parsed = parseAISMessage(
        JSON.stringify({
          MessageType: "PositionReport",
          MetaData: { MMSI: row.mmsi, time_utc: row.timestamp },
          Message: {
            PositionReport: {
              Latitude: row.lat,
              Longitude: row.lon,
              Sog: row.speed,
              Cog: row.course,
              TrueHeading: row.heading,
            },
          },
        }),
      );
      if (
        parsed?.type === "position" &&
        parsed.position.lat >= 30 &&
        parsed.position.lat <= 46 &&
        parsed.position.lon >= -6 &&
        parsed.position.lon <= 36.5
      ) {
        const p: VesselPosition = {
          ...parsed.position,
          nav_status: row.nav_status ?? "unknown",
          gap_before:
            !!previous &&
            previous.mmsi === row.mmsi &&
            Date.parse(row.timestamp) - Date.parse(previous.timestamp) >
              30 * 60_000,
        };
        if (p.gap_before && previous)
          c.tracks.append({ ...previous, significant: true });
        c.tracks.append(p);
        previous = p;
        count++;
      }
    }
    await c.tracks.flush();
    cursor = {
      mmsi: data.at(-1)!.mmsi,
      timestamp: data.at(-1)!.timestamp,
      position: previous,
    };
    atomicWrite(path, JSON.stringify(cursor));
  }
  console.info(
    JSON.stringify({
      event: "legacy_import_verified",
      positions: count,
      original_table_preserved: true,
    }),
  );
}
void main().catch(() => {
  console.error(
    "Importazione legacy non riuscita: checkpoint e tabella originale conservati.",
  );
  process.exitCode = 1;
});

import { config as dotenv } from "dotenv";
import { join, resolve } from "node:path";
import { runtimeConfig } from "../shared/runtime.js";
import {
  PostgresRepository,
  MemoryRepository,
  TABLES,
} from "../storage/repository.js";
import { BucketStore, FileObjectStore } from "../storage/object-store.js";
import {
  DiskBudget,
  DurableOutbox,
  readJSON,
  atomicWrite,
} from "../storage/durable.js";
import { TrackStore } from "../storage/track-store.js";
import { LiveStore, unknownVessel } from "./live-store.js";
import { Ingestor } from "../ingestor/index.js";
import { SanctionsCache } from "../api/services/sanctions.js";
import type { VesselPosition } from "../shared/types.js";
export async function createContext() {
  dotenv({ path: process.env.ENV_FILE ?? resolve(".env.local") });
  const config = runtimeConfig(),
    repo = config.demo
      ? new MemoryRepository()
      : new PostgresRepository(
          config.SUPABASE_URL!,
          config.SUPABASE_SERVICE_ROLE_KEY!,
        );
  const objects = config.demo
    ? new FileObjectStore(join(config.storageDir, "objects"))
    : new BucketStore(config);
  const budget = new DiskBudget(config.storageDir, config.STORAGE_MAX_BYTES),
    outbox = new DurableOutbox(config.storageDir, repo, budget),
    tracks = new TrackStore(config.storageDir, repo, objects, budget),
    live = new LiveStore(),
    ingestor = new Ingestor(
      config.storageDir,
      live,
      tracks,
      outbox,
      config.bbox,
    ),
    sanctions = new SanctionsCache(repo);
  if (config.demo && repo instanceof MemoryRepository) {
    const snapshot = readJSON<Record<string, unknown[]> | null>(
      join(config.storageDir, "demo-metadata.json"),
      null,
    );
    if (snapshot)
      for (const table of TABLES)
        await repo.upsert(table, snapshot[table] ?? []);
    await seedDemo(repo, live, tracks, ingestor);
  }
  let historyStartedAt: string | null = null;
  async function refreshHistoryStart() {
    const archived = (await repo.metrics()).first_observation_at;
    const pending = tracks.pendingSummary().first_at;
    historyStartedAt =
      [archived, pending].filter((s): s is string => !!s).sort()[0] ?? null;
  }
  try {
    await ingestor.warm();
    await refreshHistoryStart();
  } catch {
    console.warn(
      JSON.stringify({
        event: "database_startup_unavailable",
        recovered_live: live.positions.size,
      }),
    );
  }
  await sanctions.refresh().catch(() => undefined);
  return {
    config,
    repo,
    objects,
    budget,
    outbox,
    tracks,
    live,
    ingestor,
    sanctions,
    get historyStartedAt() {
      return historyStartedAt;
    },
    refreshHistoryStart,
    checkpoint() {
      ingestor.checkpoint();
      if (repo instanceof MemoryRepository)
        atomicWrite(
          join(config.storageDir, "demo-metadata.json"),
          JSON.stringify(repo.data),
        );
    },
  };
}
export type Context = Awaited<ReturnType<typeof createContext>>;
async function seedDemo(
  repo: MemoryRepository,
  live: LiveStore,
  tracks: TrackStore,
  ingestor: Ingestor,
) {
  const mmsi = "900000001",
    name = "Aurora · nave dimostrativa",
    now = Date.now();
  await repo.upsert("vessels", [
    {
      ...unknownVessel(mmsi),
      name,
      ship_type: "cargo",
      length: 140,
      width: 22,
      updated_at: new Date(now).toISOString(),
    },
  ]);
  if (!(await repo.archives(mmsi)).length && !tracks.pending(mmsi).length) {
    // Entirely fictional route, labelled demo in every live response.
    for (let age = 90 * 24 * 60 - 1; age >= 0; age -= 60) {
      const timestamp = new Date(now - age * 60_000).toISOString();
      const phase = age / 1800;
      const p: VesselPosition = {
        mmsi,
        timestamp,
        lat: 37.8 + Math.sin(phase) * 0.6,
        lon: 13 + Math.cos(phase) * 2,
        speed: 9,
        course: (age / 5) % 360,
        heading: null,
        nav_status: "underway_engine",
        gap_before: age === 1800,
        significant: age === 1800,
      };
      tracks.append(p);
    }
    await tracks.flush();
  }
  const pos: VesselPosition = {
    mmsi,
    lat: 37.8,
    lon: 15,
    speed: 9,
    course: 270,
    heading: null,
    nav_status: "underway_engine",
    timestamp: new Date(now).toISOString(),
  };
  live.latest(pos);
  ingestor.source = {
    connected: false,
    subscribed: false,
    status: "demo",
    last_message_at: pos.timestamp,
    last_disconnect_at: null,
    outages: [],
  };
  await repo.upsert("detected_stops", [
    {
      id: "demo-stop",
      mmsi,
      port_name: "38.12,13.37",
      port_lat: 38.12,
      port_lon: 13.37,
      arrived_at: new Date(now - 86400_000).toISOString(),
      departed_at: new Date(now - 18 * 3600_000).toISOString(),
      last_seen_at: new Date(now - 18 * 3600_000).toISOString(),
      duration_hours: 6,
      uncertain_departure: false,
    },
  ]);
}

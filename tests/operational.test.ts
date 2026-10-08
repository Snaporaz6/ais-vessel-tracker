import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { MemoryRepository } from "../storage/repository.js";
import { FileObjectStore } from "../storage/object-store.js";
import { DurableOutbox, DiskBudget } from "../storage/durable.js";
import { TrackStore } from "../storage/track-store.js";
import { LiveStore, unknownVessel } from "../server/live-store.js";
import { Ingestor } from "../ingestor/index.js";
import { SanctionsCache } from "../api/services/sanctions.js";
import { createApp } from "../api/index.js";
import type { Context } from "../server/context.js";
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "ais-operational-")),
    repo = new MemoryRepository(),
    objects = new FileObjectStore(join(root, "objects")),
    budget = new DiskBudget(root),
    outbox = new DurableOutbox(root, repo, budget),
    tracks = new TrackStore(root, repo, objects, budget),
    live = new LiveStore(),
    ingestor = new Ingestor(root, live, tracks, outbox, [30, -6, 46, 36.5]);
  return { root, repo, objects, budget, outbox, tracks, live, ingestor };
}
test("readiness degrades on failed metadata delivery even when database reads and AIS remain available", async (t) => {
  const f = fixture();
  f.ingestor.source = {
    connected: true,
    subscribed: true,
    status: "live",
    last_message_at: new Date().toISOString(),
    last_disconnect_at: null,
    outages: [],
  };
  const c = {
    ...f,
    config: { origins: ["http://localhost:3000"], demo: false },
    sanctions: new SanctionsCache(f.repo),
  } as unknown as Context;
  const server = createApp(c, false).listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  assert.equal((await fetch(base + "/ready")).status, 200);
  const upsert = f.repo.upsert.bind(f.repo);
  f.repo.upsert = async () => {
    throw new Error("write unavailable");
  };
  f.outbox.enqueue("vessels", unknownVessel("900000001"));
  await assert.rejects(f.outbox.flush());
  const response = await fetch(base + "/ready");
  assert.equal(response.status, 503);
  const result = await response.json();
  assert.equal(result.checks.database, true);
  assert.equal(result.checks.writes, false);
  assert.equal(f.outbox.pending, 1);
  f.repo.upsert = upsert;
  await f.outbox.flush();
  assert.equal((await fetch(base + "/ready")).status, 200);
});
test("restoring an old open stop closes it at the last observation with uncertain departure", async () => {
  const f = fixture(),
    at = new Date(Date.now() - 2 * 3600_000).toISOString();
  await f.repo.upsert("detected_stops", [
    {
      id: "old-stop",
      mmsi: "900000001",
      port_name: "38,15",
      port_lat: 38,
      port_lon: 15,
      arrived_at: new Date(Date.now() - 3 * 3600_000).toISOString(),
      last_seen_at: at,
      departed_at: null,
      duration_hours: 1,
      uncertain_departure: false,
    },
  ]);
  await f.ingestor.warm();
  f.ingestor.checkpoint();
  await f.outbox.flush();
  const stop = (await f.repo.stops())[0];
  assert.equal(stop.departed_at, at);
  assert.equal(stop.uncertain_departure, true);
  assert.equal(f.ingestor.stops.active["900000001"], undefined);
});
test("location responses query nearby stops only and identify their limited summary", async (t) => {
  const f = fixture();
  const rows = Array.from({ length: 60 }, (_, i) => ({
    id: String(i),
    mmsi: "900000001",
    port_name: "38,15",
    port_lat: 38,
    port_lon: 15,
    arrived_at: new Date(Date.now() - i * 60_000).toISOString(),
    last_seen_at: new Date().toISOString(),
    departed_at: null,
    duration_hours: 1,
    uncertain_departure: false,
  }));
  await f.repo.upsert("detected_stops", rows);
  const c = {
    ...f,
    config: { origins: [], demo: true },
    sanctions: new SanctionsCache(f.repo),
  } as unknown as Context;
  const nearby = f.repo.nearbyStops.bind(f.repo);
  f.repo.nearbyStops = async (lat, lon) => {
    assert.equal(lat, 38);
    assert.equal(lon, 15);
    return nearby(lat, lon);
  };
  const server = createApp(c, false).listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const result = await (await fetch(base + "/api/port/38,15")).json();
  assert.equal(result.total_visits, 50);
  assert.equal(result.results_limited, true);
  assert.equal(result.summary_scope, "recent_visits");
  assert.equal(result.recent_visits.length, 50);
  f.tracks.read = async () => {
    throw new Error("TRACK_WINDOW_TOO_LARGE");
  };
  assert.equal(
    (await fetch(base + "/api/vessel/900000001/track?days=90")).status,
    422,
  );
});

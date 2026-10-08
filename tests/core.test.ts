import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocketServer } from "ws";
import { once } from "node:events";
import { parseAISMessage } from "../ingestor/parser.js";
import { AISClient, subscription } from "../ingestor/ws-client.js";
import { AnomalyDetector } from "../ingestor/anomaly-detector.js";
import { StopDetector } from "../ingestor/stops.js";
import { Ingestor } from "../ingestor/index.js";
import {
  compactPositions,
  downsampleTrack,
  mergePositions,
  splitTrack,
} from "../shared/history.js";
import { MemoryRepository } from "../storage/repository.js";
import { FileObjectStore, checksum } from "../storage/object-store.js";
import { TrackStore } from "../storage/track-store.js";
import { DiskBudget, DurableOutbox } from "../storage/durable.js";
import { LiveStore, unknownVessel } from "../server/live-store.js";
import { backup, restore } from "../storage/backup.js";
import { SanctionsCache } from "../api/services/sanctions.js";
import {
  syncSanctions,
  parseEU,
  parseOFAC,
} from "../scripts/sync-sanctions.js";
import { createApp } from "../api/index.js";
import type { Context } from "../server/context.js";
import type { RuntimeConfig } from "../shared/runtime.js";
import type {
  VesselPosition,
  PortCall,
  SanctionRecord,
} from "../shared/types.js";
const now = Date.now(),
  mmsi = "900000001";
const pos = (
  offset = 0,
  extra: Partial<VesselPosition> = {},
): VesselPosition => ({
  mmsi,
  lat: 38,
  lon: 15,
  speed: 10,
  course: 0,
  heading: 0,
  nav_status: "underway_engine",
  timestamp: new Date(now + offset).toISOString(),
  ...extra,
});
const message = (
  p = pos(),
  kind = "PositionReport",
  fields: Record<string, unknown> = {},
) =>
  JSON.stringify({
    MessageType: kind,
    MetaData: {
      MMSI: Number(p.mmsi),
      latitude: p.lat,
      longitude: p.lon,
      time_utc: p.timestamp,
      ShipName: "Aurora",
    },
    Message: {
      [kind]: {
        Valid: true,
        UserID: Number(p.mmsi),
        Latitude: p.lat,
        Longitude: p.lon,
        Sog: p.speed,
        Cog: p.course,
        TrueHeading: p.heading,
        ...fields,
      },
    },
  });
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "ais-test-")),
    repo = new MemoryRepository(),
    objects = new FileObjectStore(join(root, "objects")),
    budget = new DiskBudget(root),
    outbox = new DurableOutbox(root, repo, budget),
    tracks = new TrackStore(root, repo, objects, budget),
    live = new LiveStore(),
    ingestor = new Ingestor(root, live, tracks, outbox, [30, -6, 46, 36.5]);
  return { root, repo, objects, budget, outbox, tracks, live, ingestor };
}
test("official subscription uses APIKey and latitude/longitude, Mediterranean only", () => {
  assert.deepEqual(subscription("secret", [30, -6, 46, 36.5]).BoundingBoxes, [
    [
      [30, -6],
      [46, 36.5],
    ],
  ]);
  assert.equal(subscription("secret", [30, -6, 46, 36.5]).APIKey, "secret");
});
test("parser rejects malformed, invalid timestamps/IDs/coordinates; accepts meridian and null AIS values", () => {
  for (const raw of [
    "null",
    "[]",
    '{"MessageType":"PositionReport"}',
    "broken",
  ])
    assert.equal(parseAISMessage(raw), null);
  assert.equal(parseAISMessage(message(pos(0, { lat: 91 }))), null);
  assert.equal(parseAISMessage(message(pos(0, { mmsi: "000000000" }))), null);
  const raw = JSON.parse(message());
  raw.MetaData.time_utc = "yesterday";
  assert.equal(parseAISMessage(JSON.stringify(raw)), null);
  assert.equal(
    parseAISMessage(message(pos(), "PositionReport", { Valid: false })),
    null,
  );
  const result = parseAISMessage(
    message(pos(0, { lon: 0 }), "PositionReport", {
      Sog: 102.3,
      Cog: 360,
      TrueHeading: 511,
    }),
  );
  assert.equal(result?.type, "position");
  if (result?.type === "position") {
    assert.equal(result.position.lon, 0);
    assert.equal(result.position.speed, null);
    assert.equal(result.position.course, null);
    assert.equal(result.position.heading, null);
  }
});
test("class B metadata parts and extended position are merged without overwriting unknowns", () => {
  const a = parseAISMessage(
    message(pos(), "StaticDataReport", {
      PartNumber: false,
      ReportA: { Valid: true, Name: "CLASS B" },
      ReportB: { Valid: false, ShipType: 0 },
    }),
  );
  const b = parseAISMessage(
    message(pos(), "StaticDataReport", {
      PartNumber: true,
      ReportB: {
        Valid: true,
        ShipType: 37,
        Dimension: { A: 10, B: 5, C: 2, D: 3 },
      },
      ReportA: { Valid: false, Name: "" },
    }),
  );
  assert.equal(a?.vessel.name, "CLASS B");
  assert.equal(b?.vessel.ship_type, "pleasure");
  assert.equal(b?.vessel.length, 15);
  const e = parseAISMessage(
    message(pos(), "ExtendedClassBPositionReport", { Type: 30 }),
  );
  assert.equal(e?.type, "position");
  assert.equal(e?.vessel.ship_type, "fishing");
  const eta = parseAISMessage(
    message(pos(), "ShipStaticData", {
      Type: 70,
      Eta: { Month: 2, Day: 31, Hour: 24, Minute: 60 },
    }),
  );
  assert.equal(eta?.vessel.eta, null);
});
test("90-day progressive tracks preserve endpoints, turns, stop transitions and observation gaps", () => {
  const all: VesselPosition[] = [];
  for (let i = 90 * 1440; i >= 0; i--) {
    if (i < 40 * 1440 && i > 40 * 1440 - 180) continue;
    all.push(
      pos(-i * 60_000, {
        lon: 15 + i / 1e6,
        course: i < 75 * 1440 ? 90 : 0,
        nav_status: i < 500 && i > 450 ? "at_anchor" : "underway_engine",
        speed: i < 500 && i > 450 ? 0 : 10,
        gap_before: i === 40 * 1440 - 180,
      }),
    );
  }
  const compact = compactPositions(all, now);
  assert(compact.length < all.length / 10);
  const displayed = downsampleTrack(compact, 5000);
  assert.equal(displayed[0].timestamp, all[0].timestamp);
  assert.equal(displayed.at(-1)!.timestamp, all.at(-1)!.timestamp);
  assert(
    displayed.some(
      (p) => p.timestamp === pos(-75 * 1440 * 60_000 + 60_000).timestamp,
    ),
  );
  assert(displayed.some((p) => p.nav_status === "at_anchor"));
  assert.equal(splitTrack(displayed).length, 2);
  const gap = compact.findIndex((p) => p.gap_before);
  assert(displayed.some((p) => p.timestamp === compact[gap - 1].timestamp));
  assert(displayed.length <= 5000);
});
test("archive upload/corruption and catalog failures preserve spool; retries are idempotent", async () => {
  const f = fixture();
  f.tracks.append(pos(-120_000));
  f.tracks.append(pos(-60_000));
  const original = f.objects.get.bind(f.objects);
  let broken = true;
  f.objects.get = async (key) =>
    broken ? Buffer.from("corrupt") : original(key);
  await assert.rejects(f.tracks.flush());
  assert.equal(f.tracks.pending().length, 2);
  broken = false;
  const upsert = f.repo.upsert.bind(f.repo);
  let fail = true;
  f.repo.upsert = async (table, rows) => {
    if (table === "track_archives" && fail) throw new Error("offline");
    await upsert(table, rows);
  };
  await assert.rejects(f.tracks.flush());
  assert.equal(f.tracks.pending().length, 2);
  fail = false;
  await f.tracks.flush();
  await f.tracks.flush();
  assert.equal((await f.repo.archives()).length, 1);
  assert.equal(f.tracks.pending().length, 0);
  assert.equal((await f.tracks.read(mmsi, pos(-180_000).timestamp)).length, 2);
  const fresh = new TrackStore(f.root, f.repo, f.objects, f.budget);
  assert.equal((await fresh.read(mmsi, pos(-180_000).timestamp)).length, 2);
});
test("observations appended during an upload survive snapshot deletion", async () => {
  const f = fixture();
  f.tracks.append(pos(-120_000));
  const put = f.objects.put.bind(f.objects);
  let release!: () => void;
  const blocked = new Promise<void>((r) => (release = r));
  let entered!: () => void;
  const uploading = new Promise<void>((r) => (entered = r));
  f.objects.put = async (key, data) => {
    entered();
    await blocked;
    await put(key, data);
  };
  const flush = f.tracks.flush();
  await uploading;
  f.tracks.append(pos(-60_000));
  release();
  await flush;
  assert.equal(f.tracks.pending().length, 1);
  assert.equal((await f.tracks.read(mmsi, pos(-180_000).timestamp)).length, 2);
});
test("duplicates, out-of-order messages and restart do not reset prior observations or detection", async () => {
  const f = fixture();
  assert(f.ingestor.receive(message(pos(-120_000))));
  assert.equal(f.ingestor.receive(message(pos(-120_000))), false);
  assert.equal(f.ingestor.receive(message(pos(-180_000))), false);
  f.ingestor.receive(message(pos(-60_000, { lon: 16 })));
  assert(f.ingestor.detector.cooldown[mmsi + ":speed_anomaly"]);
  f.ingestor.checkpoint();
  await f.outbox.flush();
  const live = new LiveStore(),
    second = new Ingestor(f.root, live, f.tracks, f.outbox, [30, -6, 46, 36.5]);
  await second.warm();
  assert.equal(live.positions.get(mmsi)?.timestamp, pos(-60_000).timestamp);
  assert(second.detector.cooldown[mmsi + ":speed_anomaly"]);
  assert.equal((await f.repo.anomalies(mmsi))[0].type, "speed_anomaly");
});
test("anomaly thresholds use vessel type and exclude whole-service observation gaps", () => {
  const detector = new AnomalyDetector(),
    previous = pos(-7 * 3600_000),
    next = pos();
  assert.equal(
    detector.check(previous, next, "cargo", [
      { from: previous.timestamp, to: next.timestamp },
    ]).length,
    0,
  );
  assert(
    detector
      .check(previous, next, "cargo", [])
      .some((e) => e.type === "dark_activity"),
  );
  const from = pos(-3600_000),
    to = pos(-3000_000, { lon: 15.1 });
  assert(
    new AnomalyDetector()
      .check(from, to, "fishing", [])
      .some((e) => e.type === "speed_anomaly"),
  );
  assert.equal(
    new AnomalyDetector().check(from, to, "passenger", []).length,
    0,
  );
});
test("crash before checkpoint/database delivery restores cooldown and open stops from durable outbox", () => {
  const f = fixture();
  f.ingestor.receive(message(pos(-120_000)));
  f.ingestor.receive(message(pos(-60_000, { lon: 16 })));
  const stop: PortCall = {
    id: "outbox-stop",
    mmsi,
    port_name: "38,16",
    port_lat: 38,
    port_lon: 16,
    arrived_at: pos(-1800_000).timestamp,
    last_seen_at: pos(-60_000).timestamp,
    departed_at: null,
    duration_hours: 0.5,
    uncertain_departure: false,
  };
  f.outbox.enqueue("detected_stops", stop);
  const restored = new Ingestor(
    f.root,
    new LiveStore(),
    new TrackStore(f.root, f.repo, f.objects, f.budget),
    new DurableOutbox(f.root, f.repo, f.budget),
    [30, -6, 46, 36.5],
  );
  assert.equal(
    restored.live.positions.get(mmsi)?.timestamp,
    pos(-60_000).timestamp,
  );
  assert(restored.detector.cooldown[mmsi + ":speed_anomaly"]);
  assert.equal(restored.stops.active[mmsi]?.id, stop.id);
  f.outbox.enqueue("detected_stops", {
    ...stop,
    departed_at: stop.last_seen_at,
  });
  const again = new Ingestor(
    f.root,
    new LiveStore(),
    f.tracks,
    f.outbox,
    [30, -6, 46, 36.5],
  );
  assert.equal(again.stops.active[mmsi], undefined);
});
test("one stop detector closes on movement or observation gaps, never spans missing hours", () => {
  const rows: PortCall[] = [];
  const d = new StopDetector((p) => rows.push(p));
  for (let i = 0; i <= 40; i++)
    d.observe(pos((-120 + i) * 60_000, { speed: 0, nav_status: "at_anchor" }));
  assert(rows.length > 0);
  d.observe(pos(-79 * 60_000, { speed: 0, lon: 15.1 }));
  assert(rows.some((p) => p.departed_at !== null));
  d.observe(pos(-10 * 60_000, { speed: 0, lon: 15.1 }));
  assert.equal(d.active[mmsi].arrived_at, pos(-10 * 60_000).timestamp);
  assert(d.active[mmsi].duration_hours === 0);
});
test("failed sanctions imports keep valid lists and report unavailable/stale rather than no match", async () => {
  const f = fixture(),
    record: SanctionRecord = {
      mmsi,
      imo: null,
      name: "Fictional fixture",
      source: "OFAC",
      listed_at: pos().timestamp,
      details_json: {},
    };
  await f.repo.replaceSanctions("OFAC", [record], pos().timestamp);
  await assert.rejects(f.repo.replaceSanctions("OFAC", [], pos().timestamp));
  assert.equal((await f.repo.all("sanctions")).length, 1);
  await assert.rejects(
    syncSanctions(f.repo, async () => {
      throw new Error("network");
    }),
  );
  assert.equal((await f.repo.all("sanctions")).length, 1);
  const cache = new SanctionsCache(f.repo);
  await cache.refresh();
  assert.equal(cache.check(mmsi).check.status, "matched");
  assert.equal(cache.check("900000999").check.status, "unavailable");
  assert.equal(cache.check(mmsi).check.sources[0].status, "stale");
});
test("sanctions parsers require actual official schemas and isolated EU vessel table", () => {
  assert.throws(() => parseOFAC("<html>error</html>", pos().timestamp));
  assert.throws(() => parseEU("<html>IMO 1234567</html>", pos().timestamp));
  const rows = Array.from(
    { length: 100 },
    (_, i) =>
      `<tr><td>${i + 1}</td><td>Fixture ${i}</td><td>${1000000 + i}</td><td>Article 3s</td><td>1.1.2025</td></tr>`,
  ).join("");
  const html = `<table><tr><td>Vessel name</td><td>IMO number</td><td>Grounds for inclusion</td><td>Date of application</td></tr>${rows}</table>`;
  assert.equal(parseEU(html, pos().timestamp).length, 100);
});
test("backup is checksum-verified and restores complete tracks/metadata to an empty target", async () => {
  const f = fixture();
  await f.repo.upsert("vessels", [unknownVessel(mmsi)]);
  f.tracks.append(pos(-120_000));
  f.tracks.append(pos(-60_000));
  await f.tracks.flush();
  const b = await backup(f.repo, f.objects),
    data = await f.objects.get(b.key);
  assert.equal(checksum(data), b.checksum);
  const target = new MemoryRepository();
  await restore(target, f.objects, data, b.checksum);
  assert.equal((await target.archives()).length, 1);
  await assert.rejects(restore(target, f.objects, data, b.checksum));
  await assert.rejects(
    restore(new MemoryRepository(), f.objects, Buffer.from("bad"), b.checksum),
  );
  const t = new TrackStore(
    mkdtempSync(join(tmpdir(), "ais-restore-")),
    target,
    f.objects,
    f.budget,
  );
  assert.equal((await t.read(mmsi, pos(-180_000).timestamp)).length, 2);
});
test("API returns uniform limited live data, endpoint-preserving tracks, explicit outage errors and restricted CORS", async (t) => {
  const f = fixture(),
    sanctions = new SanctionsCache(f.repo);
  await sanctions.refresh();
  for (let i = 0; i < 5001; i++)
    f.live.latest(pos(0, { mmsi: String(900000000 + i) }));
  f.live.metadata(unknownVessel(mmsi));
  f.tracks.append(pos(-120_000));
  f.tracks.append(pos(-60_000));
  const c = {
    ...f,
    config: { origins: ["http://localhost:3000"], demo: true } as RuntimeConfig,
    sanctions,
    historyStartedAt: pos(-120_000).timestamp,
  } as unknown as Context;
  const server = createApp(c, false).listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const port = (server.address() as any).port,
    base = `http://127.0.0.1:${port}`;
  const live = await (await fetch(base + "/api/map/live")).json();
  assert.equal(live.vessels.length, 5000);
  assert.equal(live.total_in_bbox, 5001);
  assert.equal(live.truncated, true);
  assert.equal((await fetch(base + "/api/map/live?bbox=bad")).status, 400);
  assert.equal(
    (
      await fetch(base + "/api/map/live", {
        headers: { Origin: "https://evil.invalid" },
      })
    ).status,
    403,
  );
  const track = await fetch(base + `/api/vessel/${mmsi}/track?days=1`),
    points = await track.json();
  assert.equal(points.at(-1).timestamp, f.live.positions.get(mmsi)!.timestamp);
  assert.equal(track.headers.get("X-Track-Last-At"), points.at(-1).timestamp);
  assert.equal((await fetch(base + "/ready")).status, 503);
  assert.equal((await fetch(base + "/health")).status, 200);
  f.repo.search = async () => {
    throw new Error("database secret");
  };
  const res = await fetch(base + "/api/search?q=aurora");
  assert.equal(res.status, 503);
  assert(!(await res.text()).includes("secret"));
});
test("WebSocket distinguishes confirmations/errors from observations and reconnects after disconnect", async (t) => {
  const server = new WebSocketServer({ port: 0, host: "127.0.0.1" });
  await once(server, "listening");
  let connections = 0;
  const seen: string[] = [];
  const client = new AISClient(
    "fixture-secret",
    [30, -6, 46, 36.5],
    (raw) => {
      const result = parseAISMessage(raw);
      if (result?.type === "position") {
        seen.push(raw);
        return true;
      }
      return false;
    },
    undefined,
    `ws://127.0.0.1:${(server.address() as any).port}`,
    20,
  );
  t.after(() => {
    client.stop();
    for (const s of server.clients) s.terminate();
    server.close();
  });
  server.on("connection", (ws) => {
    connections++;
    ws.once("message", (raw) => {
      assert.equal(JSON.parse(raw.toString()).APIKey, "fixture-secret");
      ws.send(
        JSON.stringify({
          MessageType: "SubscriptionConfirmation",
          Message: { CompressionEnabled: false },
        }),
      );
      ws.send("{}");
      if (connections === 1) setTimeout(() => ws.close(), 40);
      else ws.send(message(pos(-2000)));
    });
  });
  client.start();
  const deadline = Date.now() + 5000;
  while (!seen.length && Date.now() < deadline)
    await new Promise((r) => setTimeout(r, 10));
  assert(seen.length > 0);
  assert(connections >= 2);
  assert.equal(client.state.status, "live");
  assert.equal(client.state.subscribed, true);
  assert.equal(client.state.outages.at(-1)?.to !== null, true);
});

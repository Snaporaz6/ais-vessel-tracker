import { join } from "node:path";
import type {
  VesselPosition,
  SourceState,
  Vessel,
  PortCall,
  AnomalyEvent,
} from "../shared/types.js";
import { parseAISMessage } from "./parser.js";
import { AnomalyDetector } from "./anomaly-detector.js";
import { StopDetector } from "./stops.js";
import { significantChange, observationGap } from "../shared/history.js";
import {
  atomicWrite,
  readJSON,
  type DurableOutbox,
} from "../storage/durable.js";
import type { TrackStore } from "../storage/track-store.js";
import type { LiveStore } from "../server/live-store.js";
interface Checkpoint {
  positions: VesselPosition[];
  vessels: Vessel[];
  source: SourceState;
  cooldown: Record<string, number>;
  stops: Record<string, PortCall>;
}
export class Ingestor {
  readonly detector = new AnomalyDetector();
  readonly stops: StopDetector;
  readonly checkpointPath: string;
  private sampled = new Map<string, VesselPosition>();
  private persistedMetadata = new Map<string, string>();
  source: SourceState = {
    connected: false,
    subscribed: false,
    status: "starting",
    last_message_at: null,
    last_disconnect_at: null,
    outages: [],
  };
  constructor(
    root: string,
    readonly live: LiveStore,
    readonly tracks: TrackStore,
    readonly outbox: DurableOutbox,
    readonly bbox: [number, number, number, number],
  ) {
    this.checkpointPath = join(root, "live-checkpoint.json");
    this.stops = new StopDetector((stop) =>
      this.outbox.enqueue("detected_stops", stop),
    );
    const state = readJSON<Checkpoint | null>(this.checkpointPath, null);
    if (state) {
      for (const p of state.positions) live.latest(p);
      for (const v of state.vessels) live.metadata(v);
      this.source = state.source;
      this.detector.cooldown = state.cooldown;
      this.stops.active = state.stops;
    }
    for (const p of tracks.pendingSummary().latest.values()) {
      live.latest(p);
      this.sampled.set(p.mmsi, p);
    }
    this.replayOutbox();
  }
  async warm() {
    for (const v of await this.outbox.repo.all<Vessel>("vessels")) {
      this.live.metadata(v);
      this.persistedMetadata.set(
        v.mmsi,
        JSON.stringify({ ...v, updated_at: "" }),
      );
    }
    for await (const e of this.outbox.repo.iterateArchives())
      this.live.latest(e.last_position);
    for (const event of await this.outbox.repo.all<AnomalyEvent>(
      "anomaly_events",
    )) {
      const key = event.mmsi + ":" + event.type;
      this.detector.cooldown[key] = Math.max(
        this.detector.cooldown[key] ?? 0,
        Date.parse(event.detected_at),
      );
    }
    for (const stop of await this.outbox.repo.stops()) this.restoreStop(stop);
    this.replayOutbox();
  }
  private restoreStop(stop: PortCall) {
    const current = this.stops.active[stop.mmsi];
    if (current && current.last_seen_at! > stop.last_seen_at!) return;
    if (stop.departed_at) {
      if (current?.id === stop.id) delete this.stops.active[stop.mmsi];
    } else if (Date.now() - Date.parse(stop.last_seen_at!) <= 30 * 60_000)
      this.stops.active[stop.mmsi] = stop;
    else {
      if (current?.id === stop.id) delete this.stops.active[stop.mmsi];
      this.outbox.enqueue("detected_stops", {
        ...stop,
        departed_at: stop.last_seen_at,
        uncertain_departure: true,
      });
    }
  }
  private replayOutbox() {
    for (const item of this.outbox.records()) {
      if (item.table === "vessels") this.live.metadata(item.row as Vessel);
      else if (item.table === "anomaly_events") {
        const e = item.row as AnomalyEvent,
          key = e.mmsi + ":" + e.type;
        this.detector.cooldown[key] = Math.max(
          this.detector.cooldown[key] ?? 0,
          Date.parse(e.detected_at),
        );
      } else if (item.table === "detected_stops")
        this.restoreStop(item.row as PortCall);
    }
  }
  receive(raw: string) {
    const result = parseAISMessage(raw);
    if (!result) return false;
    if (result.type === "static") {
      this.metadata(result.vessel);
      return false;
    }
    const p = result.position,
      [minLat, minLon, maxLat, maxLon] = this.bbox;
    if (p.lat < minLat || p.lat > maxLat || p.lon < minLon || p.lon > maxLon)
      return false;
    const prev = this.live.positions.get(p.mmsi);
    if (prev && Date.parse(p.timestamp) - Date.parse(prev.timestamp) < 2000)
      return false;
    const vessel = this.metadata(result.vessel);
    const anomalies = this.detector.check(
      prev,
      p,
      vessel.ship_type,
      this.source.outages,
    );
    if (anomalies.length) {
      p.anomaly_flags = anomalies.map((a) => a.type);
      p.significant = true;
      for (const a of anomalies)
        this.outbox.enqueue("anomaly_events", {
          event_key: a.id,
          mmsi: a.mmsi,
          type: a.type,
          detected_at: a.detected_at,
          details: a.details,
        });
      this.live.flags.set(
        p.mmsi,
        anomalies.map((a) => ({ type: a.type, at: a.detected_at })),
      );
    }
    p.gap_before = Boolean(prev && observationGap(prev, p));
    const lastSaved = this.sampled.get(p.mmsi),
      important = !lastSaved || significantChange(lastSaved, p);
    if (
      important ||
      p.gap_before ||
      Date.parse(p.timestamp) - Date.parse(lastSaved!.timestamp) >= 60_000
    ) {
      if (prev && (p.gap_before || important))
        this.tracks.append({ ...prev, significant: true });
      p.significant = p.significant || important;
      this.tracks.append(p);
      this.sampled.set(p.mmsi, p);
    }
    this.stops.observe(p);
    this.live.latest(p);
    return true;
  }
  private metadata(patch: Partial<Vessel> & { mmsi: string }): Vessel {
    const next = this.live.metadata(patch),
      fingerprint = JSON.stringify({ ...next, updated_at: "" });
    if (fingerprint !== this.persistedMetadata.get(next.mmsi)) {
      this.outbox.enqueue("vessels", next);
      this.persistedMetadata.set(next.mmsi, fingerprint);
    }
    return next;
  }
  checkpoint() {
    this.stops.expire();
    this.live.prune();
    const data = JSON.stringify({
      positions: [...this.live.positions.values()],
      vessels: [...this.live.vessels.values()],
      source: this.source,
      cooldown: this.detector.cooldown,
      stops: this.stops.active,
    } satisfies Checkpoint);
    this.outbox.budget.check(Buffer.byteLength(data));
    atomicWrite(this.checkpointPath, data);
  }
}

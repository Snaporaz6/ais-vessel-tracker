import WebSocket from "ws";
import type { SourceState } from "../shared/types.js";
import { SOURCE_STALE_MS } from "../shared/config.js";
export function subscription(
  apiKey: string,
  bbox: [number, number, number, number],
) {
  return {
    APIKey: apiKey,
    BoundingBoxes: [
      [
        [bbox[0], bbox[1]],
        [bbox[2], bbox[3]],
      ],
    ],
    FilterMessageTypes: [
      "PositionReport",
      "StandardClassBPositionReport",
      "ExtendedClassBPositionReport",
      "ShipStaticData",
      "StaticDataReport",
    ],
  };
}
export class AISClient {
  state: SourceState;
  connections = 0;
  private ws?: WebSocket;
  private retry?: NodeJS.Timeout;
  private heartbeat?: NodeJS.Timeout;
  private stopped = true;
  private attempts = 0;
  private pongAt = Date.now();
  private openedAt = Date.now();
  constructor(
    readonly key: string,
    readonly bbox: [number, number, number, number],
    readonly onMessage: (raw: string) => boolean,
    restored?: SourceState,
    readonly url = "wss://stream.aisstream.io/v0/stream",
    readonly retryBase = 1000,
  ) {
    this.state = restored ?? {
      connected: false,
      subscribed: false,
      last_message_at: null,
      last_disconnect_at: null,
      status: "starting",
      outages: [],
    };
    this.disconnect(this.state.last_message_at ?? new Date().toISOString());
  }
  private disconnect(at = new Date().toISOString()) {
    this.state.connected = false;
    this.state.subscribed = false;
    this.state.status = "disconnected";
    this.state.last_disconnect_at = at;
    if (!this.state.outages.some((o) => o.to === null))
      this.state.outages.push({ from: at, to: null });
  }
  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.connect();
  }
  private connect() {
    if (this.stopped) return;
    const ws = new WebSocket(this.url, {
      handshakeTimeout: 15_000,
      perMessageDeflate: true,
      maxPayload: 2 * 1024 * 1024,
    });
    this.ws = ws;
    ws.on("open", () => {
      this.connections++;
      this.openedAt = Date.now();
      this.pongAt = Date.now();
      this.state.connected = true;
      this.state.status = "starting";
      ws.send(JSON.stringify(subscription(this.key, this.bbox)));
    });
    ws.on("pong", () => {
      this.pongAt = Date.now();
    });
    ws.on("message", (raw) => {
      const text = raw.toString();
      let control: Record<string, unknown>;
      try {
        const parsed = JSON.parse(text);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
          return;
        control = parsed;
      } catch {
        return;
      }
      if (control.Error || control.error || control.MessageType === "Error") {
        console.warn(JSON.stringify({ event: "ais_service_error" }));
        ws.close(1008);
        return;
      }
      if (
        control.MessageType === "SubscriptionConfirmation" ||
        control.SubscriptionConfirmation
      ) {
        this.state.subscribed = true;
        return;
      }
      try {
        if (this.onMessage(text)) {
          this.state.subscribed = true;
          this.state.last_message_at = new Date().toISOString();
          this.state.status = "live";
          for (const outage of this.state.outages)
            if (outage.to === null) outage.to = this.state.last_message_at;
          this.state.outages = this.state.outages.filter(
            (o) => !o.to || Date.parse(o.to) >= Date.now() - 90 * 86400_000,
          );
          if (Date.now() - this.openedAt > 60_000) this.attempts = 0;
        }
      } catch {
        console.error(
          JSON.stringify({ event: "ingestion_durable_write_failed" }),
        );
        ws.close(1011);
      }
    });
    ws.on("error", () =>
      console.warn(JSON.stringify({ event: "ais_connection_error" })),
    );
    ws.on("close", () => {
      if (this.heartbeat) clearInterval(this.heartbeat);
      this.disconnect();
      if (!this.stopped) {
        const delay =
          Math.min(60_000, this.retryBase * 2 ** Math.min(this.attempts++, 6)) *
          (0.8 + Math.random() * 0.4);
        this.retry = setTimeout(() => this.connect(), delay);
      }
    });
    this.heartbeat = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) return;
      if (Date.now() - this.pongAt > 60_000) {
        ws.terminate();
        return;
      }
      if (
        this.state.last_message_at &&
        Date.now() - Date.parse(this.state.last_message_at) > SOURCE_STALE_MS
      ) {
        this.state.status = "stale";
        if (!this.state.outages.some((o) => o.to === null))
          this.state.outages.push({
            from: this.state.last_message_at,
            to: null,
          });
      }
      if (!this.state.subscribed && Date.now() - this.openedAt > 60_000) {
        ws.terminate();
        return;
      }
      ws.ping();
    }, 15_000);
    this.heartbeat.unref();
  }
  stop() {
    this.stopped = true;
    clearTimeout(this.retry);
    clearInterval(this.heartbeat);
    this.disconnect();
    this.ws?.close(1000);
    this.ws?.terminate();
  }
  /** Operator-requested reconnect; retains automatic backoff and subscription logic. */
  forceReconnect() {
    this.ws?.terminate();
  }
}

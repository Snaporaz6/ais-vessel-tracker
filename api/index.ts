import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import rateLimit from "express-rate-limit";
import type { Context } from "../server/context.js";
import type {
  LiveMapResponse,
  PortInfo,
  VesselDetail,
  TrackMetadata,
  VesselPosition,
} from "../shared/types.js";
import {
  downsampleTrack,
  mergePositions,
  trackGaps,
} from "../shared/history.js";
import {
  HISTORY_TIERS,
  LIVE_TTL_MS,
  LIVE_MAP_MAX_VESSELS,
  TRACK_MAX_POINTS,
  SOURCE_STALE_MS,
} from "../shared/config.js";
import { AppError, ValidationError, NotFoundError } from "../shared/errors.js";
import { gzipSync } from "node:zlib";
const asyncRoute =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    void fn(req, res).catch(next);
  };
const mmsiOf = (req: Request) => {
  const m = String(req.params.mmsi);
  if (!/^[1-9]\d{8}$/.test(m)) throw new ValidationError("MMSI non valido");
  return m;
};
function daysOf(req: Request) {
  const days = Number(req.query.days ?? 30);
  if (![1, 7, 30, 90].includes(days))
    throw new ValidationError("Scegliere 1, 7, 30 o 90 giorni");
  return days;
}
export function createApp(c: Context, limited = true) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  const liveResponses = new Map<
    string,
    { at: number; plain: Buffer; gzip: Buffer }
  >();
  function sendLive(
    res: Response,
    req: Request,
    value: { plain: Buffer; gzip: Buffer },
  ) {
    const compressed =
      /\bgzip\b/.test(req.headers["accept-encoding"] ?? "") &&
      !/gzip\s*;\s*q=0(?:\D|$)/.test(req.headers["accept-encoding"] ?? "");
    res.vary("Accept-Encoding");
    res.set("Cache-Control", "no-store").type("application/json");
    if (compressed) res.set("Content-Encoding", "gzip");
    return res.send(compressed ? value.gzip : value.plain);
  }
  app.use(helmet(), compression());
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || c.config.origins.includes(origin)) callback(null, true);
        else
          callback(new AppError("Origine non consentita", "CORS_DENIED", 403));
      },
      exposedHeaders: [
        "X-Track-First-At",
        "X-Track-Last-At",
        "X-Track-Available-Points",
        "X-Track-Sampled",
        "X-Track-Sampling",
      ],
    }),
  );
  if (limited)
    app.use(
      "/api",
      rateLimit({
        windowMs: 60_000,
        limit: 120,
        standardHeaders: "draft-7",
        legacyHeaders: false,
        message: {
          error: "Troppe richieste. Riprovare tra un minuto.",
          code: "RATE_LIMIT",
        },
      }),
    );
  app.get("/health", (_, res) => res.json({ status: "ok" }));
  app.get(
    "/ready",
    asyncRoute(async (_, res) => {
      const [db, bucket] = await Promise.allSettled([
        c.repo.health(),
        c.objects.health(),
      ]);
      const source = c.ingestor.source,
        fresh =
          !!source.last_message_at &&
          Date.now() - Date.parse(source.last_message_at) <= SOURCE_STALE_MS;
      const oldestWrite = c.outbox.oldestPendingAt;
      const checks = {
        database: db.status === "fulfilled",
        archive: bucket.status === "fulfilled" && !c.tracks.lastError,
        ais: source.connected && source.subscribed && fresh && !c.config.demo,
        volume: c.budget.bytes < c.budget.limit,
        pending_writes: c.outbox.pending,
        writes:
          !c.outbox.lastError &&
          (oldestWrite === null || Date.now() - oldestWrite <= SOURCE_STALE_MS),
      };
      const ok =
        checks.database &&
        checks.archive &&
        checks.ais &&
        checks.volume &&
        checks.writes;
      res.status(ok ? 200 : 503).json({
        status: ok ? "operational" : c.config.demo ? "demo" : "degraded",
        checks,
        last_observation_at: source.last_message_at,
        archive_flushed_at: c.tracks.lastFlush,
      });
    }),
  );
  app.get("/api/map/live", (req, res, next) => {
    try {
      const bbox = String(req.query.bbox ?? "-6,30,36.5,46")
        .split(",")
        .map(Number);
      if (
        bbox.length !== 4 ||
        !bbox.every(Number.isFinite) ||
        bbox[0] >= bbox[2] ||
        bbox[1] >= bbox[3] ||
        bbox[0] < -180 ||
        bbox[2] > 180 ||
        bbox[1] < -90 ||
        bbox[3] > 90
      )
        throw new ValidationError(
          "Area non valida: lonMin,latMin,lonMax,latMax",
        );
      const key = bbox.join(","),
        cached = liveResponses.get(key);
      if (cached && Date.now() - cached.at < 2000)
        return sendLive(res, req, cached);
      const now = Date.now(),
        vessels: LiveMapResponse["vessels"] = [];
      let total = 0,
        inBbox = 0;
      for (const p of c.live.positions.values()) {
        if (now - Date.parse(p.timestamp) > LIVE_TTL_MS) continue;
        total++;
        if (
          p.lon < bbox[0] ||
          p.lon > bbox[2] ||
          p.lat < bbox[1] ||
          p.lat > bbox[3]
        )
          continue;
        inBbox++;
        if (vessels.length >= LIVE_MAP_MAX_VESSELS) continue;
        const v = c.live.vessels.get(p.mmsi),
          sanctions = c.sanctions.check(p.mmsi, v?.imo),
          flags = (
            [
              "dark_activity",
              "speed_anomaly",
              "impossible_movement",
              "ais_spoofing",
            ] as const
          ).filter(
            (type) =>
              now - (c.ingestor.detector.cooldown[p.mmsi + ":" + type] ?? 0) <=
              30 * 60_000,
          );
        vessels.push({
          mmsi: p.mmsi,
          name: v?.name ?? "Nome non disponibile",
          ship_type: v?.ship_type ?? "other",
          lat: p.lat,
          lon: p.lon,
          speed: p.speed,
          course: p.course,
          timestamp: p.timestamp,
          is_sanctioned: sanctions.records.length > 0,
          sanction_status: sanctions.check.status,
          anomaly_flags: flags,
        });
      }
      const source = {
        ...c.ingestor.source,
        outages: c.ingestor.source.outages.slice(-20),
      };
      if (
        source.status === "live" &&
        (!source.last_message_at ||
          now - Date.parse(source.last_message_at) > SOURCE_STALE_MS)
      )
        source.status = "stale";
      const plain = Buffer.from(
        JSON.stringify({
          vessels,
          total_live: total,
          total_in_bbox: inBbox,
          truncated: inBbox > vessels.length,
          source,
          generated_at: new Date(now).toISOString(),
          history_started_at: c.historyStartedAt,
        } satisfies LiveMapResponse),
      );
      if (liveResponses.size >= 8)
        liveResponses.delete(liveResponses.keys().next().value!);
      const value = { at: now, plain, gzip: gzipSync(plain) };
      liveResponses.set(key, value);
      sendLive(res, req, value);
    } catch (e) {
      next(e);
    }
  });
  app.get(
    "/api/search",
    asyncRoute(async (req, res) => {
      const q = String(req.query.q ?? "").trim();
      if (q.length < 2 || q.length > 100)
        throw new ValidationError("Ricerca: da 2 a 100 caratteri");
      res.json(await c.repo.search(q));
    }),
  );
  app.get(
    "/api/vessel/:mmsi",
    asyncRoute(async (req, res) => {
      const m = mmsiOf(req);
      const vessel = c.live.vessels.get(m) ?? (await c.repo.vessel(m));
      if (!vessel) throw new NotFoundError("Nave", m);
      const sanctions = c.sanctions.check(m, vessel.imo),
        result = await Promise.allSettled([c.repo.anomalies(m)]);
      res.json({
        ...vessel,
        last_position: c.live.positions.get(m) ?? null,
        sanctions: sanctions.records,
        sanctions_check: sanctions.check,
        anomalies: result[0].status === "fulfilled" ? result[0].value : [],
        data_status: result[0].status === "fulfilled" ? "ok" : "partial",
      } satisfies VesselDetail);
    }),
  );
  async function track(req: Request) {
    const m = mmsiOf(req),
      days = daysOf(req),
      since = new Date(Date.now() - days * 86400_000).toISOString();
    const latest = c.live.positions.get(m);
    const all = mergePositions(
      await c.tracks.read(m, since),
      latest && latest.timestamp >= since ? [latest] : [],
    );
    const points = downsampleTrack(all, TRACK_MAX_POINTS);
    const metadata: TrackMetadata = {
      requested_days: days,
      first_at: all[0]?.timestamp ?? null,
      last_at: all.at(-1)?.timestamp ?? null,
      available_points: all.length,
      returned_points: points.length,
      sampled: points.length < all.length,
      gaps: trackGaps(all),
      intervals: [...HISTORY_TIERS],
    };
    return { points, metadata };
  }
  app.get(
    "/api/vessel/:mmsi/track",
    asyncRoute(async (req, res) => {
      const { points, metadata } = await track(req);
      res
        .set({
          "X-Track-First-At": metadata.first_at ?? "",
          "X-Track-Last-At": metadata.last_at ?? "",
          "X-Track-Available-Points": String(metadata.available_points),
          "X-Track-Sampled": String(metadata.sampled),
          "X-Track-Sampling": JSON.stringify(metadata.intervals),
          "Cache-Control": "public, max-age=15",
        })
        .json(points);
    }),
  );
  app.get(
    "/api/vessel/:mmsi/track/metadata",
    asyncRoute(async (req, res) => res.json((await track(req)).metadata)),
  );
  app.get(
    "/api/vessel/:mmsi/anomalies",
    asyncRoute(async (req, res) =>
      res.json(await c.repo.anomalies(mmsiOf(req))),
    ),
  );
  app.get(
    "/api/vessel/:mmsi/portcalls",
    asyncRoute(async (req, res) => res.json(await c.repo.stops(mmsiOf(req)))),
  );
  app.get(
    "/api/port/:name",
    asyncRoute(async (req, res) => {
      const coord = req.params.name.split(",").map(Number);
      if (
        coord.length !== 2 ||
        !coord.every(Number.isFinite) ||
        Math.abs(coord[0]) > 90 ||
        Math.abs(coord[1]) > 180
      )
        throw new ValidationError("Località non valida");
      const nearby = await c.repo.nearbyStops(coord[0], coord[1]);
      const resultsLimited = nearby.length > 50;
      const stops = nearby.slice(0, 50);
      const ids = new Set(stops.map((s) => s.mmsi));
      const visits = stops.slice(0, 50).map((s) => {
        const v = c.live.vessels.get(s.mmsi);
        return {
          mmsi: s.mmsi,
          vessel_name: v?.name ?? "Nome non disponibile",
          ship_type: v?.ship_type ?? ("other" as const),
          flag: v?.flag ?? "",
          arrived_at: s.arrived_at,
          departed_at: s.departed_at,
          duration_hours: s.duration_hours,
        };
      });
      const current = stops.filter(
        (s) =>
          !s.departed_at &&
          Date.now() - Date.parse(s.last_seen_at!) <= 30 * 60_000,
      );
      res.json({
        port_name: req.params.name,
        lat: coord[0],
        lon: coord[1],
        total_vessels_seen: ids.size,
        total_visits: stops.length,
        results_limited: resultsLimited,
        summary_scope: "recent_visits",
        currently_in_port: new Set(current.map((s) => s.mmsi)).size,
        avg_stay_hours: stops.length
          ? stops.reduce((s, p) => s + p.duration_hours, 0) / stops.length
          : 0,
        recent_visits: visits,
      } satisfies PortInfo);
    }),
  );
  app.use(
    (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
      if (error instanceof AppError)
        return res
          .status(error.statusCode)
          .json({ error: error.message, code: error.code });
      if (error instanceof Error && error.message === "TOO_MANY_GAPS")
        return res.status(422).json({
          error: "Troppe interruzioni: restringere la finestra dello storico.",
          code: "TRACK_TOO_COMPLEX",
        });
      if (error instanceof Error && error.message === "TRACK_WINDOW_TOO_LARGE")
        return res.status(422).json({
          error:
            "Storico troppo esteso da elaborare: scegliere un periodo più breve.",
          code: "TRACK_WINDOW_TOO_LARGE",
        });
      console.warn(JSON.stringify({ event: "api_dependency_error" }));
      return res.status(503).json({
        error: "Servizio temporaneamente non disponibile. Riprovare.",
        code: "SERVICE_UNAVAILABLE",
      });
    },
  );
  return app;
}

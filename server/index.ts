import cron, { type ScheduledTask } from "node-cron";
import { createApp } from "../api/index.js";
import { createContext } from "./context.js";
import { AISClient } from "../ingestor/ws-client.js";
import { backup } from "../storage/backup.js";
import { syncSanctions } from "../scripts/sync-sanctions.js";
import { timingSafeEqual } from "node:crypto";
import { DailyMaintenance } from "./maintenance.js";
import { BackgroundJobs } from "./jobs.js";
export async function startServer() {
  const c = await createContext(),
    app = createApp(c),
    started = Date.now();
  let shuttingDown = false;
  const intervals: NodeJS.Timeout[] = [],
    schedules: ScheduledTask[] = [];
  const jobs = new BackgroundJobs();
  let daily: DailyMaintenance | undefined;
  const job = jobs.run.bind(jobs);
  app.get("/admin/metrics", async (req, res) => {
    const actual = Buffer.from(req.headers.authorization ?? ""),
      expected = Buffer.from(`Bearer ${c.config.ADMIN_TOKEN ?? ""}`);
    if (
      !c.config.ADMIN_TOKEN ||
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected)
    )
      return res.sendStatus(401);
    try {
      const storage = await c.repo.metrics(),
        cpu = process.cpuUsage();
      return res.json({
        at: new Date().toISOString(),
        uptime_seconds: (Date.now() - started) / 1000,
        cpu_seconds: (cpu.user + cpu.system) / 1e6,
        rss_bytes: process.memoryUsage().rss,
        persistent_bytes: c.budget.bytes,
        persistent_limit_bytes: c.budget.limit,
        pending_writes: c.outbox.pending,
        live_vessels: c.live.positions.size,
        history_started_at: c.historyStartedAt,
        archive_flushed_at: c.tracks.lastFlush,
        archive_error: c.tracks.lastError,
        maintenance_errors: daily?.status().retry_after ?? {},
        sanctions_sources: c.sanctions.check("000000000").check.sources,
        source: c.ingestor.source,
        ...storage,
      });
    } catch {
      return res
        .status(503)
        .json({ error: "Metriche database non disponibili." });
    }
  });
  const server = app.listen(c.config.API_PORT, "0.0.0.0", () =>
    console.info(
      JSON.stringify({
        event: "server_listening",
        port: c.config.API_PORT,
        mode: c.config.demo ? "demo" : "live",
      }),
    ),
  );
  const client = c.config.demo
    ? null
    : new AISClient(
        c.config.AISSTREAM_API_KEY!,
        c.config.bbox,
        (raw) => c.ingestor.receive(raw),
        c.ingestor.source,
      );
  if (client) {
    c.ingestor.source = client.state;
    client.start();
  }
  intervals.push(
    setInterval(() => {
      if (c.outbox.pending) void job("outbox", () => c.outbox.flush());
    }, 500),
  );
  intervals.push(
    setInterval(() => {
      try {
        c.checkpoint();
        c.budget.rescan();
      } catch {
        console.error(JSON.stringify({ event: "checkpoint_failed" }));
        client?.forceReconnect();
      }
    }, 60_000),
  );
  intervals.push(
    setInterval(
      () =>
        void job("archive", async () => {
          await c.outbox.flush();
          await c.tracks.flush();
          await c.refreshHistoryStart();
        }),
      3600_000,
    ),
  );
  intervals.push(
    setInterval(
      () => void c.sanctions.refresh().catch(() => undefined),
      60_000,
    ),
  );
  if (!c.config.demo) {
    daily = new DailyMaintenance(c.config.storageDir, [
      {
        name: "sanctions",
        hour: 3,
        minute: 0,
        action: async () => {
          await syncSanctions(c.repo, fetch, { onlyDue: true });
          await c.sanctions.refresh();
        },
      },
      {
        name: "maintenance_backup",
        hour: 3,
        minute: 30,
        action: async () => {
          await c.outbox.flush();
          await c.tracks.flush();
          await c.refreshHistoryStart();
          await backup(c.repo, c.objects);
          await c.tracks.flush(Date.now(), true);
          await c.refreshHistoryStart();
        },
      },
    ]);
    const recoverDaily = () => {
      if (!shuttingDown)
        daily!.requestDue((name, action) => void job(name, action));
    };
    recoverDaily();
    intervals.push(setInterval(recoverDaily, 60_000));
    schedules.push(
      cron.schedule("0 3 * * *", recoverDaily, { timezone: "UTC" }),
    );
    schedules.push(
      cron.schedule("30 3 * * *", recoverDaily, { timezone: "UTC" }),
    );
  }
  async function stop() {
    if (shuttingDown) return;
    shuttingDown = true;
    jobs.close();
    client?.stop();
    for (const i of intervals) clearInterval(i);
    for (const s of schedules) s.stop();
    server.close();
    const deadline = Date.now() + 25_000;
    while (jobs.busy && Date.now() < deadline)
      await new Promise((r) => setTimeout(r, 50));
    c.checkpoint();
    await c.outbox.flush().catch(() => undefined); // Spool stays on volume; next process archives it safely.
  }
  process.once("SIGTERM", () => void stop().then(() => process.exit(0)));
  process.once("SIGINT", () => void stop().then(() => process.exit(0)));
  return { server, c, stop };
}
if (require.main === module)
  void startServer().catch(() => {
    console.error(
      JSON.stringify({
        event: "startup_failed",
        hint: "Verificare configurazione e volume persistente.",
      }),
    );
    process.exitCode = 1;
  });

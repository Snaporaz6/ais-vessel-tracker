import { config as dotenv } from "dotenv";
import { createContext } from "../server/context.js";
import { createApp } from "../api/index.js";
import { createServer } from "node:http";

/** Isolated staging API: real restored observations, no acquisition or scheduled writes. */
async function main() {
  dotenv({ path: process.env.ENV_FILE ?? ".env.staging" });
  if (
    process.env.NODE_ENV !== "test" ||
    process.env.SNAPSHOT_TEST_ONLY !== "true" ||
    process.env.DEMO_MODE === "true"
  )
    throw new Error("ISOLATED_SNAPSHOT_CONFIGURATION_REQUIRED");
  const c = await createContext({ requireAIS: false });
  c.ingestor.source = {
    connected: false,
    subscribed: false,
    status: "disconnected",
    last_message_at:
      [...c.live.positions.values()]
        .map((p) => p.timestamp)
        .sort()
        .at(-1) ?? null,
    last_disconnect_at: null,
    outages: [],
  };
  const app = createApp(c);
  const server = createServer((req, res) => {
    res.setHeader("X-AIS-Environment", "staging-snapshot");
    app(req, res);
  }).listen(c.config.API_PORT, "0.0.0.0", () =>
    console.info(
      JSON.stringify({ event: "snapshot_listening", port: c.config.API_PORT }),
    ),
  );
  for (const signal of ["SIGTERM", "SIGINT"])
    process.once(signal, () => {
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 10_000).unref();
    });
}
void main().catch(() => {
  console.error(JSON.stringify({ event: "snapshot_startup_failed" }));
  process.exitCode = 1;
});

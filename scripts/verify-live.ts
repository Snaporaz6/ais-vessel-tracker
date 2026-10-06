import { config } from "dotenv";
import { AISClient } from "../ingestor/ws-client.js";
import { parseAISMessage } from "../ingestor/parser.js";
import { writeFileSync } from "node:fs";
config({ path: process.env.ENV_FILE ?? ".env.local" });
async function main() {
  const key = process.env.AISSTREAM_API_KEY;
  if (!key) throw new Error("AISSTREAM_API_KEY_REQUIRED");
  let accepted = 0,
    invalid = 0,
    control = 0,
    recovered = false,
    disconnectedAt: number | null = null;
  const types: Record<string, number> = {},
    metadataKeys = new Set<string>(),
    started = Date.now();
  const client = new AISClient(key, [30, -6, 46, 36.5], (raw) => {
    const obj = JSON.parse(raw);
    Object.keys(obj.MetaData ?? {}).forEach((k) => metadataKeys.add(k));
    const result = parseAISMessage(raw);
    if (!result) {
      invalid++;
      return false;
    }
    types[String(obj.MessageType)] = (types[String(obj.MessageType)] ?? 0) + 1;
    if (result.type !== "position") {
      control++;
      return false;
    }
    accepted++;
    if (disconnectedAt && accepted > 10 && client.connections >= 2)
      recovered = true;
    return true;
  });
  client.start();
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline && !recovered) {
    await new Promise((r) => setTimeout(r, 100));
    if (accepted >= 10 && !disconnectedAt) {
      disconnectedAt = Date.now();
      client.forceReconnect();
    }
  }
  const result = {
    at: new Date().toISOString(),
    duration_seconds: (Date.now() - started) / 1000,
    valid_positions: accepted,
    valid_static: control,
    rejected: invalid,
    types,
    metadata_fields: [...metadataKeys],
    connections: client.connections,
    subscription_confirmed: client.state.subscribed,
    recovered_after_disconnect: recovered,
    passed: accepted > 10 && recovered && client.state.subscribed,
  };
  client.stop();
  if (process.env.REPORT_FILE)
    writeFileSync(process.env.REPORT_FILE, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  if (!result.passed) process.exitCode = 1;
}
void main().catch(() => {
  console.error("Verifica AIS reale non riuscita.");
  process.exitCode = 1;
});

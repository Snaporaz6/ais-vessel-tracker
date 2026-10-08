import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { PostgresRepository } from "../storage/repository.js";

test("backup scans preserve existing rows once when live inserts shift earlier pages", async (t) => {
  const original = Array.from({ length: 600 }, (_, i) => ({
    mmsi: String(900000000 + (i + 1) * 2),
  }));
  const current = [...original];
  let mutated = false;
  const server = createServer((req, res) => {
    const url = new URL(req.url!, "http://localhost");
    const filters = url.searchParams.getAll("mmsi");
    let rows = current
      .filter((r) =>
        filters.every((f) => {
          const [op, key] = f.split(".");
          return op === "gt"
            ? r.mmsi > key
            : op === "lte"
              ? r.mmsi <= key
              : true;
        }),
      )
      .sort((a, b) => a.mmsi.localeCompare(b.mmsi));
    if (url.searchParams.get("order")?.includes("desc")) rows.reverse();
    const start = Number(url.searchParams.get("offset") ?? 0),
      limit = Number(url.searchParams.get("limit") ?? 500);
    rows = rows.slice(start, start + limit);
    if (url.searchParams.get("select") === "*" && !mutated) {
      mutated = true;
      current.push({ mmsi: "900000003" }, { mmsi: "900999999" });
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(rows));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const repo = new PostgresRepository(base, "test-key");
  const rows = await repo.all<{ mmsi: string }>("vessels");
  assert.equal(mutated, true);
  assert.equal(rows.length, 600);
  assert.equal(new Set(rows.map((r) => r.mmsi)).size, 600);
  assert.deepEqual(
    rows.map((r) => r.mmsi),
    original.map((r) => r.mmsi),
  );
});

import test from "node:test";
import assert from "node:assert/strict";
import { MemoryRepository } from "../storage/repository.js";
import { syncSanctions } from "../scripts/sync-sanctions.js";
test("daily retries contact only failed sources and keep already successful imports", async () => {
  const repo = new MemoryRepository(),
    at = new Date().toISOString();
  await repo.upsert(
    "import_states",
    ["OFAC", "EU"].map((source) => ({
      source,
      updated_at: at,
      attempted_at: at,
      last_error: null,
      record_count: 100,
    })),
  );
  const calls: string[] = [];
  const fetcher = (async (url: any) => {
    calls.push(String(url));
    throw new Error("temporary failure");
  }) as typeof fetch;
  await syncSanctions(repo, fetcher, { onlyDue: true });
  assert.equal(calls.length, 0);
  await repo.importFailure("EU", at);
  await assert.rejects(syncSanctions(repo, fetcher, { onlyDue: true }));
  assert.equal(calls.length, 1);
  assert(calls[0].includes("eur-lex.europa.eu"));
  assert.equal(
    repo.data.import_states.find((s) => s.source === "OFAC").last_error,
    null,
  );
});

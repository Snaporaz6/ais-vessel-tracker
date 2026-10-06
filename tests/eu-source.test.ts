import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveEUConsolidatedURL,
  syncSanctions,
} from "../scripts/sync-sanctions.js";
import { MemoryRepository } from "../storage/repository.js";
const at = "2026-10-06T12:00:00.000Z";
const index = `<a href="./../../../legal-content/EN/AUTO/?uri=CELEX:02014R0833-20260717">17/07/2026</a>
<a href="https://[">Malformed link</a>
<a href="./../../../legal-content/EN/AUTO/?uri=CELEX:02014R0833-20260724">Access current version (24/07/2026)</a>
<a href="https://example.com/?uri=CELEX:02014R0833-20260930">External</a>
<a href="?uri=CELEX:02014R0833-20261340">Invalid</a>
<a href="?uri=CELEX:02014R0833-20261007">Future</a>
<a href="?uri=CELEX:02014R0269-20261001">Another act</a>`;
test("EU discovery follows the newest published consolidation of the correct regulation", () => {
  assert.equal(
    resolveEUConsolidatedURL(index, at),
    "https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:02014R0833-20260724",
  );
  assert.throws(() =>
    resolveEUConsolidatedURL("<html>Verification required</html>", at),
  );
});
test("a failed EU version discovery preserves the previous list and marks the check unavailable", async () => {
  const repo = new MemoryRepository(),
    now = new Date().toISOString();
  const records = Array.from({ length: 100 }, (_, i) => ({
    source: "EU" as const,
    imo: String(9000000 + i),
    mmsi: null,
    name: `Vessel ${i}`,
    listed_at: at,
    details_json: {},
  }));
  await repo.replaceSanctions(
    "EU",
    records,
    new Date(Date.now() - 86_400_000).toISOString(),
  );
  await repo.upsert("import_states", [
    {
      source: "OFAC",
      updated_at: now,
      attempted_at: now,
      last_error: null,
      record_count: 100,
    },
  ]);
  await assert.rejects(
    syncSanctions(
      repo,
      (async () =>
        new Response("<html>Verification required</html>")) as typeof fetch,
      { onlyDue: true },
    ),
  );
  assert.equal(repo.data.sanctions.length, 100);
  assert(repo.data.import_states.find((s) => s.source === "EU").last_error);
});

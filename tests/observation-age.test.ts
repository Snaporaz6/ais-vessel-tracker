import { test } from "node:test";
import assert from "node:assert/strict";
import { observationAge } from "../frontend/lib/observation-age.js";

test("observation age respects the 15-minute and 1-hour boundaries", () => {
  const timestamp = "2026-10-14T18:25:00.000Z";
  const at = Date.parse(timestamp);
  assert.equal(observationAge(timestamp, at + 15 * 60_000), "recent");
  assert.equal(observationAge(timestamp, at + 15 * 60_000 + 1), "warning");
  assert.equal(observationAge(timestamp, at + 60 * 60_000), "warning");
  assert.equal(observationAge(timestamp, at + 60 * 60_000 + 1), "old");
  assert.equal(observationAge(timestamp, at - 60_000), "recent");
  assert.equal(observationAge("invalid", at), "recent");
});

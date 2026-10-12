import test from "node:test";
import assert from "node:assert/strict";
import { checkedDatabase, databaseFetch } from "../shared/database-errors.js";
test("database diagnostics retain a safe classification without provider content", () => {
  for (const [code, name] of [
    ["57014", "DATABASE_QUERY_TIMEOUT"],
    ["42501", "DATABASE_PERMISSION_DENIED"],
    ["PGRST202", "DATABASE_SCHEMA_MISMATCH"],
  ])
    assert.throws(
      () =>
        checkedDatabase({
          data: null,
          error: { code, message: "private token" },
        }),
      new RegExp("^Error: " + name + "$"),
    );
  assert.equal(checkedDatabase({ data: 42, error: null }), 42);
});
test("read failures retry, while ambiguous mutations are never replayed", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async () => {
      calls++;
      return new Response("", { status: calls === 1 ? 503 : 200 });
    };
    assert.equal((await databaseFetch("https://example.test")).status, 200);
    assert.equal(calls, 2);
    calls = 0;
    assert.equal(
      (await databaseFetch("https://example.test", { method: "POST" })).status,
      503,
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = original;
  }
});

test("timestamp comparisons preserve sub-millisecond precision and normalize equivalent offsets", async () => {
  const { canonicalTimestamp } = await import("../shared/timestamps.js");
  assert.equal(
    canonicalTimestamp("2026-10-13T01:00:00.123456+01:00"),
    "2026-10-13T00:00:00.123456Z",
  );
  assert.equal(
    canonicalTimestamp("2026-10-13T00:00:00.180000+00:00"),
    "2026-10-13T00:00:00.180Z",
  );
  assert.equal(
    canonicalTimestamp("2026-10-13T00:00:00Z"),
    "2026-10-13T00:00:00.000Z",
  );
});

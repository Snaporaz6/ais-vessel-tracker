import test from "node:test";
import assert from "node:assert/strict";
import { runtimeConfig } from "../shared/runtime.js";

test("only the explicit snapshot reader may omit AIS credentials; ordinary acquisition still refuses them", () => {
  const previous = { ...process.env };
  try {
    Object.assign(process.env, {
      NODE_ENV: "test",
      DEMO_MODE: "false",
      SUPABASE_URL: "https://staging.example.test",
      SUPABASE_SERVICE_ROLE_KEY: "test-only",
      S3_ENDPOINT: "https://archive.example.test",
      S3_BUCKET: "isolated-test",
      S3_ACCESS_KEY_ID: "test-only",
      S3_SECRET_ACCESS_KEY: "test-only",
    });
    delete process.env.AISSTREAM_API_KEY;
    assert.throws(() => runtimeConfig(), /AISSTREAM_API_KEY/);
    assert.equal(runtimeConfig({ requireAIS: false }).demo, false);
  } finally {
    for (const key of Object.keys(process.env))
      if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous);
  }
});

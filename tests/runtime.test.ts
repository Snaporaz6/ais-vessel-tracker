import test from "node:test";
import assert from "node:assert/strict";
import { runtimeConfig } from "../shared/runtime.js";
test("persistent storage limits can be reduced for small volumes and reject unsafe settings", () => {
  const keys = ["DEMO_MODE", "NODE_ENV", "STORAGE_MAX_BYTES"] as const;
  const saved = keys.map((k) => process.env[k]);
  try {
    process.env.DEMO_MODE = "true";
    process.env.NODE_ENV = "test";
    process.env.STORAGE_MAX_BYTES = "419430400";
    assert.equal(runtimeConfig().STORAGE_MAX_BYTES, 419430400);
    for (const invalid of ["0", "-1", "not-a-number", "4294967297"]) {
      process.env.STORAGE_MAX_BYTES = invalid;
      assert.throws(() => runtimeConfig(), /STORAGE_MAX_BYTES/);
    }
  } finally {
    keys.forEach((k, i) => {
      if (saved[i] === undefined) delete process.env[k];
      else process.env[k] = saved[i];
    });
  }
});

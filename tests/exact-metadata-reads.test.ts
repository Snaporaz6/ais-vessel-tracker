import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { encodeGroup } from "../storage/metadata-groups.js";
test("exact metadata JSON survives rounded REST settings and preserves CAS comparisons", async () => {
  const db = await PGlite.create({ extensions: { pg_trgm } });
  try {
    await db.exec(
      "CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;",
    );
    await db.exec(readFileSync("scripts/init-db.sql", "utf8"));
    await db.exec(
      readFileSync("scripts/migrations/006-exact-metadata-reads.sql", "utf8"),
    );
    await db.exec(
      "INSERT INTO detected_stops VALUES ('exact','900000001','test',44.63731833333333,-1.3050666666666666,'2026-10-01T00:00:00Z','2026-10-02T00:00:00Z',1.003106388888889,'2026-10-02T00:00:00Z',false); SET extra_float_digits=0;",
    );
    const rounded = (
      await db.query<any>("SELECT to_jsonb(t) AS value FROM detected_stops t")
    ).rows[0].value;
    const page = (
      await db.query<any>(
        "SELECT metadata_hot_page_beta('detected_stops',NULL,NULL,'2026-10-06') AS value",
      )
    ).rows[0].value;
    assert.notEqual(rounded.port_lat, page[0].port_lat);
    assert.equal(page[0].port_lat, 44.63731833333333);
    assert.equal(page[0].duration_hours, 1.003106388888889);
    assert.deepEqual(
      (
        await db.query<any>(
          "SELECT metadata_hot_page_beta('detected_stops','exact') AS value",
        )
      ).rows[0].value,
      [],
    );
    const g = encodeGroup("detected_stops", "900000001", "2026-10-01", page);
    const args = [
      JSON.stringify({ ...g, payload_hex: g.payload.slice(2) }),
      JSON.stringify(page),
    ];
    assert.equal(
      (
        await db.query<any>(
          "SELECT apply_metadata_group_beta($1::jsonb,NULL,$2::jsonb) AS ok",
          args,
        )
      ).rows[0].ok,
      true,
    );
    assert.equal(
      (await db.query("SELECT * FROM detected_stops")).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query<any>(
          "SELECT has_function_privilege('anon','metadata_hot_page_beta(text,text,text,timestamptz,text)','EXECUTE') AS allowed",
        )
      ).rows[0].allowed,
      false,
    );
    await assert.rejects(
      db.query("SELECT metadata_hot_page_beta('metadata_groups')"),
      /INVALID/,
    );
  } finally {
    await db.close();
  }
});

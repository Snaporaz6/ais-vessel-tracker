import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
test("canonical initializer creates the complete beta schema on a new database", async () => {
  const db = await PGlite.create({ extensions: { pg_trgm } });
  try {
    await db.exec(
      "CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;",
    );
    await db.exec(readFileSync("scripts/init-db.sql", "utf8"));
    assert.equal(
      (await db.query("SELECT * FROM nearby_stops_beta(38,15)")).rows.length,
      0,
    );
    await db.exec("SET ROLE anon;");
    await assert.rejects(db.query("SELECT * FROM vessels"));
    await assert.rejects(db.query("SELECT * FROM nearby_stops_beta(38,15)"));
  } finally {
    await db.close();
  }
});
test("PostgreSQL migration is additive, fuzzy search works, import rollback is atomic and browser privileges are denied", async () => {
  const db = await PGlite.create({ extensions: { pg_trgm } });
  try {
    await db.exec(
      "CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA extensions;",
    );
    await db.exec(readFileSync("scripts/init-db-free-tier.sql", "utf8"));
    await db.exec(
      "INSERT INTO vessels(mmsi,imo,name) VALUES ('900000001','1000001','AURORA MEDITERRANEA'),('900000002','1000002','POLARIS'); INSERT INTO vessel_positions(mmsi,timestamp,lat,lon) VALUES('900000001',now(),38,15);",
    );
    const migration = readFileSync(
      "scripts/migrations/002-mediterranean-beta.sql",
      "utf8",
    );
    await db.exec(migration);
    await db.exec(migration);
    const stopsMigration = readFileSync(
      "scripts/migrations/003-bounded-stop-queries.sql",
      "utf8",
    );
    await db.exec(stopsMigration);
    await db.exec(stopsMigration);
    await db.exec(`INSERT INTO detected_stops(id,mmsi,port_name,port_lat,port_lon,arrived_at,last_seen_at,duration_hours)
      SELECT 'near-'||n,'900000001','38,15',38,15,now()-n*interval '1 minute',now(),1 FROM generate_series(1,60) n;
      INSERT INTO detected_stops VALUES ('far','900000002','39,16',39,16,now(),null,1,now(),false);`);
    const nearby = (
      await db.query<any>("SELECT * FROM nearby_stops_beta(38,15,999999)")
    ).rows;
    assert.equal(nearby.length, 51);
    assert.equal(nearby[0].id, "near-1");
    assert(!nearby.some((s) => s.id === "far"));
    assert.equal(
      (await db.query("SELECT * FROM vessel_positions")).rows.length,
      1,
    );
    assert.equal(
      (
        await db.query(
          "SELECT * FROM search_vessels_beta('AURORA MEDITERANEA')",
        )
      ).rows.length,
      1,
    );
    assert.equal(
      (await db.query("SELECT * FROM search_vessels_beta('1000001')")).rows
        .length,
      1,
    );
    assert.equal(
      (await db.query("SELECT * FROM search_vessels_beta('90000000')")).rows
        .length,
      0,
    );
    const at = new Date().toISOString(),
      record = {
        mmsi: "900000001",
        imo: null,
        name: "Fixture",
        source: "OFAC",
        listed_at: at,
        details_json: {},
      };
    await db.query(
      "SELECT replace_sanctions_beta($1,$2::jsonb,$3::timestamptz)",
      ["OFAC", JSON.stringify([record]), at],
    );
    await assert.rejects(
      db.query("SELECT replace_sanctions_beta($1,$2::jsonb,$3::timestamptz)", [
        "OFAC",
        JSON.stringify([{ ...record, mmsi: "invalid" }]),
        at,
      ]),
    );
    await assert.rejects(
      db.query("SELECT replace_sanctions_beta($1,$2::jsonb,$3::timestamptz)", [
        "OFAC",
        "[]",
        at,
      ]),
    );
    assert.equal((await db.query("SELECT * FROM sanctions")).rows.length, 1);
    await db.query("SELECT fail_sanctions_beta($1,$2::timestamptz)", [
      "OFAC",
      at,
    ]);
    assert.equal(
      (await db.query<any>("SELECT * FROM import_states WHERE source='OFAC'"))
        .rows[0].record_count,
      1,
    );
    await db.exec("SET ROLE anon;");
    await assert.rejects(db.query("SELECT * FROM vessels"));
    await assert.rejects(db.query("SELECT * FROM nearby_stops_beta(38,15)"));
    await assert.rejects(
      db.query("SELECT * FROM search_vessels_beta('AURORA')"),
    );
    await db.exec("RESET ROLE;");
    await db.exec("SET ROLE service_role;");
    assert.equal(
      (await db.query("SELECT * FROM search_vessels_beta('AURORA')")).rows
        .length,
      1,
    );
    await db.exec("RESET ROLE;");
  } finally {
    await db.close();
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
test("legacy retirement preserves changed rows and dependencies; verified retirement keeps table and constraints", async () => {
  const db = await PGlite.create();
  try {
    await db.exec(
      `CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role; CREATE TABLE vessel_positions(mmsi varchar(9),timestamp timestamptz,lat float8,lon float8,speed real,course real,heading real,nav_status text,PRIMARY KEY(mmsi,timestamp));INSERT INTO vessel_positions VALUES('900000001','2026-03-06T11:14:53.276123Z',38,15,2,90,NULL,'at_anchor');`,
    );
    await db.exec(
      readFileSync("scripts/migrations/005-legacy-retirement.sql", "utf8"),
    );
    const fp = (
      await db.query<{ hash: string }>(
        "SELECT legacy_positions_fingerprint_beta() AS hash",
      )
    ).rows[0].hash;
    const retire = (hash: string) =>
      db.query("SELECT retire_legacy_positions_beta(1,$1,$1,$2,$3)", [
        "2026-03-06T11:14:53.276123Z",
        hash,
        "a".repeat(64),
      ]);
    await assert.rejects(retire("b".repeat(64)), /SOURCE_CHANGED/);
    assert.equal(
      (await db.query("SELECT * FROM vessel_positions")).rows.length,
      1,
    );
    await db.exec(
      "CREATE TABLE child(mmsi varchar(9),timestamp timestamptz,FOREIGN KEY(mmsi,timestamp) REFERENCES vessel_positions);",
    );
    await assert.rejects(retire(fp), /UNEXPECTED_DEPENDENCY/);
    await db.exec("DROP TABLE child;");
    await db.exec("CREATE TABLE descendant() INHERITS(vessel_positions);");
    await assert.rejects(retire(fp), /UNEXPECTED_DEPENDENCY/);
    await db.exec("DROP TABLE descendant;");
    await retire(fp);
    assert.equal(
      (await db.query("SELECT * FROM vessel_positions")).rows.length,
      0,
    );
    await db.exec(
      "INSERT INTO vessel_positions VALUES('900000001','2026-03-06T11:14:53.276123Z',38,15,2,90,NULL,'at_anchor');",
    );
    await assert.rejects(
      db.exec(
        "INSERT INTO vessel_positions(mmsi,timestamp,lat,lon) VALUES('900000001','2026-03-06T11:14:53.276123Z',38,15)",
      ),
    );
    await db.exec("SET ROLE anon;");
    await assert.rejects(
      db.query("SELECT legacy_positions_fingerprint_beta()"),
    );
    await db.exec("RESET ROLE;");
  } finally {
    await db.close();
  }
});

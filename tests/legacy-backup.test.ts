import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { checksum } from "../storage/object-store.js";
import {
  LEGACY_TABLES,
  isRowCount,
  verifyLegacyBackup,
} from "../storage/legacy-backup.js";
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "ais-legacy-backup-")),
    tables: Record<string, any> = {},
    manifest = { at: new Date().toISOString(), verified: true, tables },
    path = join(root, "manifest.json");
  for (const table of LEGACY_TABLES) {
    const data = gzipSync('{"name":"Nave dimostrativa à 🚢"}\n');
    writeFileSync(join(root, `${table}.jsonl.gz`), data);
    tables[table] = {
      available: true,
      rows: 1,
      backup: {
        sha256: checksum(data),
        rows: 1,
        bytes: data.length,
        verified: true,
      },
    };
  }
  const save = () => writeFileSync(path, JSON.stringify(manifest));
  save();
  return { root, path, manifest, save };
}
test("legacy import accepts only files reread with matching checksums and row counts", async () => {
  const f = fixture();
  assert.equal((await verifyLegacyBackup(f.path)).verified, true);
  // An intact but different gzip file must not be trusted because the manifest says verified.
  writeFileSync(
    join(f.root, "vessel_positions.jsonl.gz"),
    gzipSync('{"name":"Altered"}\n'),
  );
  await assert.rejects(verifyLegacyBackup(f.path), /CHECKSUM_MISMATCH/);
  const counts = fixture();
  counts.manifest.tables.vessels.rows = 2;
  counts.manifest.tables.vessels.backup.rows = 2;
  counts.save();
  await assert.rejects(verifyLegacyBackup(counts.path), /COUNT_MISMATCH/);
});
test("legacy import refuses unavailable manifests, absent files and malformed records", async () => {
  for (const invalidate of [
    (f: ReturnType<typeof fixture>) => (f.manifest.verified = false),
    (f: ReturnType<typeof fixture>) =>
      (f.manifest.tables.vessels.available = false),
    (f: ReturnType<typeof fixture>) => (f.manifest.tables.vessels.rows = null),
    (f: ReturnType<typeof fixture>) =>
      (f.manifest.tables.vessels.backup.verified = false),
  ]) {
    const f = fixture();
    invalidate(f);
    f.save();
    await assert.rejects(verifyLegacyBackup(f.path), /MANIFEST_INVALID/);
  }
  const missing = fixture();
  unlinkSync(join(missing.root, "sanctions.jsonl.gz"));
  await assert.rejects(verifyLegacyBackup(missing.path));
  const malformed = fixture(),
    data = gzipSync("null\n");
  writeFileSync(join(malformed.root, "vessels.jsonl.gz"), data);
  Object.assign(malformed.manifest.tables.vessels.backup, {
    sha256: checksum(data),
    bytes: data.length,
  });
  malformed.save();
  await assert.rejects(verifyLegacyBackup(malformed.path), /ROW_INVALID/);
});
test("HEAD row counts cannot turn missing data into a valid zero-row backup", () => {
  for (const value of [null, undefined, NaN, -1, 1.5, "0", Infinity])
    assert.equal(isRowCount(value), false);
  assert.equal(isRowCount(0), true);
  assert.equal(isRowCount(596609), true);
});

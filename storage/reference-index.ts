import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

/** Exact membership is required: a missing protected object must never be deleted. */
export interface ReferenceIndex extends Iterable<string> {
  add(key: string): unknown;
  has(key: string): boolean;
  readonly size: number;
  seal?(): void;
  close?(): void;
}

/** Scratch state only. Never place this file inside the authoritative archive. */
export class DiskReferenceIndex implements ReferenceIndex {
  private readonly db: DatabaseSync;
  private readonly insert;
  private readonly lookup;
  private count = 0;
  private sealed = false;
  constructor(root: string, maxBytes = 512 * 1024 * 1024) {
    mkdirSync(root, { recursive: true });
    this.db = new DatabaseSync(join(root, "references.sqlite"), {
      allowExtension: false,
    });
    try {
      this.db.exec(`PRAGMA page_size=4096;
        PRAGMA max_page_count=${Math.max(2, Math.floor(maxBytes / 4096))};
        PRAGMA cache_size=-2048;
        PRAGMA mmap_size=0;
        PRAGMA temp_store=FILE;
        CREATE TABLE refs (key TEXT PRIMARY KEY) WITHOUT ROWID;
        BEGIN IMMEDIATE;`);
      this.insert = this.db.prepare(
        "INSERT OR IGNORE INTO refs(key) VALUES (?)",
      );
      this.lookup = this.db.prepare("SELECT 1 FROM refs WHERE key = ?");
    } catch (error) {
      this.db.close();
      throw error;
    }
  }
  add(key: string) {
    if (this.sealed) throw new Error("CLEANUP_INDEX_SEALED");
    try {
      this.count += Number(this.insert.run(key).changes);
    } catch {
      throw new Error("CLEANUP_INDEX_UNAVAILABLE");
    }
    return this;
  }
  has(key: string) {
    try {
      return this.lookup.get(key) !== undefined;
    } catch {
      throw new Error("CLEANUP_INDEX_UNAVAILABLE");
    }
  }
  get size() {
    return this.count;
  }
  seal() {
    if (!this.sealed) {
      this.db.exec("COMMIT");
      this.sealed = true;
    }
  }
  *[Symbol.iterator]() {
    for (const row of this.db
      .prepare("SELECT key FROM refs ORDER BY key")
      .iterate())
      yield String(row.key);
  }
  close() {
    this.db.close();
  }
}

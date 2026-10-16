import { join } from "node:path";
import type { Repository } from "./repository.js";
import type { ObjectStore, ObjectPage } from "./object-store.js";
import { retainedBackupReferences } from "./backup.js";
import { readJSON, atomicWrite } from "./durable.js";
import { measuredPhase } from "../shared/diagnostics.js";
import { CompactRepository } from "./compact-repository.js";
interface State {
  version: 1;
  token?: string;
  next?: string;
  pending?: { key: string; modified: string }[];
  complete: boolean;
}
export class ArchiveCleanup {
  readonly path: string;
  constructor(
    root: string,
    readonly repo: Repository,
    readonly objects: ObjectStore,
  ) {
    this.path = join(root, "archive-cleanup-checkpoint.json");
  }
  private async page(token?: string): Promise<ObjectPage> {
    if (this.objects.page) return this.objects.page("tracks/", token);
    const items = [];
    for await (const item of this.objects.list("tracks/"))
      if (!token || item.key > token) items.push(item);
    items.sort((a, b) => a.key.localeCompare(b.key));
    return {
      items: items.slice(0, 1000),
      next: items.length > 1000 ? items[999].key : undefined,
    };
  }
  async run(now = Date.now(), maxMs = 20 * 60000) {
    const started = Date.now(),
      deadline = started + maxMs;
    let state = readJSON<State>(this.path, { version: 1, complete: false });
    if (
      state.version !== 1 ||
      typeof state.complete !== "boolean" ||
      (state.token !== undefined && typeof state.token !== "string") ||
      (state.next !== undefined && typeof state.next !== "string") ||
      (state.pending !== undefined &&
        (!Array.isArray(state.pending) ||
          state.pending.length > 1000 ||
          state.pending.some(
            (o) =>
              typeof o.key !== "string" ||
              !o.key.startsWith("tracks/") ||
              !Number.isFinite(Date.parse(o.modified)),
          )))
    )
      throw new Error("CLEANUP_CHECKPOINT_INVALID");
    if (state.complete) state = { version: 1, complete: false };
    const refs = await measuredPhase("cleanup_references", async () => {
      const checkDeadline = () => {
        if (Date.now() >= deadline) throw new Error("CLEANUP_PENDING");
      };
      const refs =
        this.repo instanceof CompactRepository
          ? await this.repo.archiveReferences(checkDeadline)
          : new Set<string>();
      if (!(this.repo instanceof CompactRepository))
        for await (const row of this.repo.iterateArchives()) {
          checkDeadline();
          refs.add(row.object_key);
        }
      await retainedBackupReferences(this.objects, now, checkDeadline, refs);
      return refs;
    });
    let deleted = 0,
      pages = 0;
    const save = () => atomicWrite(this.path, JSON.stringify(state));
    while (Date.now() < deadline) {
      if (!state.pending) {
        const page = await measuredPhase("cleanup_page", () =>
          this.page(state.token),
        );
        state.pending = page.items.map((o) => ({
          key: o.key,
          modified: o.modified.toISOString(),
        }));
        state.next = page.next;
        save();
        pages++;
      }
      while (state.pending.length) {
        if (Date.now() >= deadline) {
          save();
          return {
            complete: false,
            deleted,
            pages,
            duration_ms: Date.now() - started,
          };
        }
        let consumed = 0;
        const eligible: { key: string; modified: string }[] = [];
        while (consumed < state.pending.length && eligible.length < 8) {
          const o = state.pending[consumed++];
          if (!refs.has(o.key) && now - Date.parse(o.modified) > 24 * 3600000)
            eligible.push(o);
        }
        const results = await Promise.allSettled(
          eligible.map((o) =>
            this.objects.delete(o.key, Math.max(1, deadline - Date.now())),
          ),
        );
        const failed = results.find((r) => r.status === "rejected");
        if (failed?.status === "rejected") {
          save();
          if (Date.now() >= deadline)
            return {
              complete: false,
              deleted,
              pages,
              duration_ms: Date.now() - started,
            };
          throw failed.reason;
        }
        deleted += eligible.length;
        state.pending.splice(0, consumed);
        save();
      }
      if (!state.next) {
        state.complete = true;
        save();
        return {
          complete: true,
          deleted,
          pages,
          duration_ms: Date.now() - started,
        };
      }
      state.token = state.next;
      delete state.next;
      delete state.pending;
      save();
    }
    return {
      complete: false,
      deleted,
      pages,
      duration_ms: Date.now() - started,
    };
  }
}

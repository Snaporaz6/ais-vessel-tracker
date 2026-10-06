import type {
  Repository,
  ImportState,
  Source,
} from "../../storage/repository.js";
import type { SanctionRecord, SanctionsCheck } from "../../shared/types.js";
import { SANCTIONS_STALE_MS } from "../../shared/config.js";
export class SanctionsCache {
  private records: SanctionRecord[] = [];
  private states: ImportState[] = [];
  private failed = true;
  private byId = new Map<string, SanctionRecord[]>();
  checkedAt: string | null = null;
  constructor(readonly repo: Repository) {}
  async refresh() {
    try {
      const [records, states] = await Promise.all([
        this.repo.all<SanctionRecord>("sanctions"),
        this.repo.all<ImportState>("import_states"),
      ]);
      const index = new Map<string, SanctionRecord[]>();
      for (const row of records)
        for (const id of [row.mmsi, row.imo])
          if (id) index.set(id, [...(index.get(id) ?? []), row]);
      this.records = records;
      this.states = states;
      this.byId = index;
      this.failed = false;
      this.checkedAt = new Date().toISOString();
    } catch {
      this.failed = true;
      throw new Error("SANCTIONS_CHECK_UNAVAILABLE");
    }
  }
  check(
    mmsi: string,
    imo: string | null = null,
  ): { records: SanctionRecord[]; check: SanctionsCheck } {
    const records = [
      ...new Set([
        ...(this.byId.get(mmsi) ?? []),
        ...(imo ? (this.byId.get(imo) ?? []) : []),
      ]),
    ];
    const sources = (["OFAC", "EU"] as Source[]).map((source) => {
      const state = this.states.find((s) => s.source === source);
      const status: "ok" | "stale" | "unavailable" = !state?.updated_at
        ? "unavailable"
        : this.failed ||
            state.last_error ||
            Date.now() - Date.parse(state.updated_at) > SANCTIONS_STALE_MS
          ? "stale"
          : "ok";
      return { source, updated_at: state?.updated_at ?? null, status };
    });
    return {
      records,
      check: {
        status: records.length
          ? "matched"
          : sources.some((s) => s.status === "unavailable")
            ? "unavailable"
            : sources.some((s) => s.status === "stale")
              ? "stale"
              : "no_match",
        checked_at: this.checkedAt,
        sources,
      },
    };
  }
}

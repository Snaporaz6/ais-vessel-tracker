import { join } from "node:path";
import { atomicWrite, readJSON } from "../storage/durable.js";

export interface DailyJob {
  name: string;
  hour: number;
  minute: number;
  action: () => Promise<unknown>;
}
interface MaintenanceState {
  version: 1;
  completed_for: Record<string, string>;
  retry_after: Record<string, number>;
}
type Dispatch = (name: string, action: () => Promise<unknown>) => void;

/** Recover missed UTC jobs, preserving the main process's serial job queue. */
export class DailyMaintenance {
  readonly path: string;
  private state: MaintenanceState;
  private pending = new Set<string>();
  constructor(
    root: string,
    readonly jobs: DailyJob[],
    readonly clock: () => number = Date.now,
    readonly retryMs = 5 * 60_000,
  ) {
    this.path = join(root, "maintenance-checkpoint.json");
    this.state = readJSON<MaintenanceState>(this.path, {
      version: 1,
      completed_for: {},
      retry_after: {},
    });
    if (
      this.state.version !== 1 ||
      !this.state.completed_for ||
      !this.state.retry_after ||
      Object.values(this.state.completed_for).some(
        (day) => !/^\d{4}-\d{2}-\d{2}$/.test(day),
      ) ||
      Object.values(this.state.retry_after).some((at) => !Number.isFinite(at))
    )
      throw new Error("MAINTENANCE_STATE_CORRUPT");
  }
  private dueDay(job: DailyJob, now: number) {
    const day = new Date(now);
    const scheduled = Date.UTC(
      day.getUTCFullYear(),
      day.getUTCMonth(),
      day.getUTCDate(),
      job.hour,
      job.minute,
    );
    return new Date(now < scheduled ? scheduled - 86400_000 : scheduled)
      .toISOString()
      .slice(0, 10);
  }
  status() {
    return structuredClone(this.state);
  }
  requestDue(dispatch: Dispatch) {
    const now = this.clock();
    for (const job of this.jobs) {
      const day = this.dueDay(job, now);
      if (
        this.pending.has(job.name) ||
        (this.state.completed_for[job.name] ?? "") >= day ||
        (this.state.retry_after[job.name] ?? 0) > now
      )
        continue;
      this.pending.add(job.name);
      dispatch(job.name, async () => {
        try {
          await job.action();
          const next: MaintenanceState = {
            ...this.state,
            completed_for: { ...this.state.completed_for, [job.name]: day },
            retry_after: { ...this.state.retry_after },
          };
          delete next.retry_after[job.name];
          atomicWrite(this.path, JSON.stringify(next));
          this.state = next;
        } catch (error) {
          const next: MaintenanceState = {
            ...this.state,
            retry_after: {
              ...this.state.retry_after,
              [job.name]: this.clock() + this.retryMs,
            },
          };
          // Even an ambiguous success is retried unless its completion was fsynced.
          // Archive/import operations themselves are idempotent.
          atomicWrite(this.path, JSON.stringify(next));
          this.state = next;
          throw error;
        } finally {
          this.pending.delete(job.name);
        }
      });
    }
  }
}

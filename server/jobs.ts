/** Archive/import jobs are serial; metadata delivery must keep running during them. */
export class BackgroundJobs {
  private maintenanceRunning = false;
  private delivery: Promise<void> | null = null;
  private stopping = false;
  private queued = new Map<string, () => Promise<unknown>>();

  get busy() {
    return this.maintenanceRunning || this.delivery !== null;
  }
  close() {
    this.stopping = true;
    this.queued.clear();
  }
  async run(name: string, action: () => Promise<unknown>): Promise<void> {
    if (this.stopping) return;
    if (name === "outbox") {
      if (this.delivery) return this.delivery;
      this.delivery = this.execute(name, action);
      try {
        await this.delivery;
      } finally {
        this.delivery = null;
      }
      return;
    }
    if (this.maintenanceRunning) {
      this.queued.set(name, action);
      return;
    }
    this.maintenanceRunning = true;
    try {
      await this.execute(name, action);
    } finally {
      this.maintenanceRunning = false;
      const next = this.queued.entries().next().value;
      if (next) {
        this.queued.delete(next[0]);
        void this.run(next[0], next[1]);
      }
    }
  }
  private async execute(name: string, action: () => Promise<unknown>) {
    const started = Date.now();
    try {
      await action();
      if (name !== "outbox")
        console.info(
          JSON.stringify({
            event: "maintenance_ok",
            job: name,
            duration_ms: Date.now() - started,
          }),
        );
    } catch {
      console.warn(
        JSON.stringify({
          event: "maintenance_failed",
          job: name,
          duration_ms: Date.now() - started,
        }),
      );
    }
  }
}

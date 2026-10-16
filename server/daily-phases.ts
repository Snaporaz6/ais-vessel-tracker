import { join } from "node:path";
import { atomicWrite, readJSON } from "../storage/durable.js";
import { measuredPhase } from "../shared/diagnostics.js";
/** Persist successful phases; retries of cleanup never redo a verified daily backup. */
export async function runDailyPhases(
  root: string,
  phases: { name: string; run: () => Promise<unknown> }[],
  now = Date.now(),
) {
  const today = new Date(now),
    scheduled = Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      today.getUTCDate(),
      3,
      30,
    );
  const day = new Date(now < scheduled ? scheduled - 86400000 : scheduled)
    .toISOString()
    .slice(0, 10);
  const path = join(root, "daily-phases.json");
  let state = readJSON<{ day: string; completed: string[] }>(path, {
    day,
    completed: [],
  });
  if (state.day !== day) state = { day, completed: [] };
  for (const phase of phases) {
    if (state.completed.includes(phase.name)) continue;
    await measuredPhase(phase.name, phase.run);
    state.completed.push(phase.name);
    atomicWrite(path, JSON.stringify(state));
  }
}

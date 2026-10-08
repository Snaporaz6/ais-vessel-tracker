import { createContext } from "../server/context.js";
import { restore } from "../storage/backup.js";
import { join } from "node:path";
async function main() {
  const key = process.env.BACKUP_KEY,
    sha = process.env.BACKUP_SHA256;
  if (!key || !sha || !process.argv.includes("--confirm-empty-target"))
    throw new Error("RESTORE_OPTIONS_REQUIRED");
  const c = await createContext();
  const target = c.config.demo
    ? `demo:${c.config.storageDir}`
    : new URL(c.config.SUPABASE_URL!).origin;
  await restore(c.repo, c.objects, await c.objects.get(key), sha, {
    sessionPath: join(c.config.storageDir, "restore-session.json"),
    target,
  });
  console.info(JSON.stringify({ event: "restore_verified", backup: key }));
}
void main().catch(() => {
  console.error(
    "Ripristino non riuscito. Conservare la sessione e riprovare con lo stesso backup e la stessa destinazione isolata; una nuova destinazione deve essere vuota.",
  );
  process.exitCode = 1;
});

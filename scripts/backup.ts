import { createContext } from "../server/context.js";
import { backup } from "../storage/backup.js";
async function main() {
  const c = await createContext();
  await c.outbox.flush();
  await c.tracks.flush();
  console.log(JSON.stringify(await backup(c.repo, c.objects)));
}
void main().catch(() => {
  console.error("Backup non riuscito; copia temporanea conservata.");
  process.exitCode = 1;
});

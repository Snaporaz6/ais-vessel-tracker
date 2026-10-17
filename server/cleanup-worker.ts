import { fork } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RuntimeConfig } from "../shared/runtime.js";
import { diagnosticCode } from "../shared/diagnostics.js";
import type { ArchiveCleanup } from "../storage/archive-cleanup.js";

type Result = Awaited<ReturnType<ArchiveCleanup["run"]>>;
interface Options {
  maxMs?: number;
  graceMs?: number;
  workerPath?: string;
  scratchRoot?: string;
}

/** A cleanup OOM must become a retryable job failure, never terminate API/AIS. */
export async function runCleanupWorker(
  config: RuntimeConfig,
  options: Options = {},
): Promise<Result> {
  if (config.ARCHIVE_CLEANUP_ENABLED === "false")
    throw new Error("CLEANUP_PAUSED");
  const maxMs = options.maxMs ?? 20 * 60_000;
  const scratch = await mkdtemp(
    join(options.scratchRoot ?? tmpdir(), "ais-cleanup-refs-"),
  );
  try {
    return await new Promise<Result>((resolve, reject) => {
      const development = __filename.endsWith(".ts") && !options.workerPath;
      const child = fork(
        options.workerPath ??
          require.resolve(
            development
              ? "../scripts/cleanup-worker.ts"
              : "../scripts/cleanup-worker.js",
          ),
        [],
        {
          execArgv: [
            "--max-old-space-size=128",
            ...(development ? ["--import", "tsx"] : []),
          ],
          stdio: ["ignore", "inherit", "inherit", "ipc"],
          env: {
            ...process.env,
            STORAGE_DIR: config.storageDir,
            CLEANUP_REFERENCE_DIR: scratch,
            CLEANUP_BUDGET_MS: String(maxMs),
          },
        },
      );
      let message: { ok?: boolean; result?: Result; code?: string } | undefined;
      let failure: Error | undefined;
      const terminate = () => {
        failure = new Error("CLEANUP_WORKER_STOPPED");
        child.kill("SIGTERM");
      };
      process.once("SIGTERM", terminate);
      process.once("SIGINT", terminate);
      const timer = setTimeout(
        () => {
          failure = new Error("CLEANUP_WORKER_TIMEOUT");
          child.kill("SIGKILL");
        },
        maxMs + (options.graceMs ?? 30_000),
      );
      const detach = () => {
        clearTimeout(timer);
        process.removeListener("SIGTERM", terminate);
        process.removeListener("SIGINT", terminate);
      };
      child.on("message", (value) => {
        if (value && typeof value === "object") message = value;
      });
      child.once("error", () => {
        detach();
        reject(new Error("CLEANUP_WORKER_UNAVAILABLE"));
      });
      child.once("exit", (code, signal) => {
        detach();
        if (failure) return reject(failure);
        if (code !== 0 || !message?.ok) {
          console.warn(
            JSON.stringify({
              event: "cleanup_worker_failed",
              exit_code: code,
              signal,
              code: message?.code
                ? diagnosticCode(new Error(message.code))
                : "CLEANUP_WORKER_EXITED",
            }),
          );
          return reject(
            new Error(
              message?.code
                ? diagnosticCode(new Error(message.code))
                : "CLEANUP_WORKER_EXITED",
            ),
          );
        }
        const result = message.result;
        if (
          !result ||
          typeof result.complete !== "boolean" ||
          [result.deleted, result.pages, result.duration_ms].some(
            (v) => !Number.isFinite(v) || v < 0,
          )
        )
          return reject(new Error("CLEANUP_WORKER_INVALID_RESULT"));
        resolve(result);
      });
    });
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

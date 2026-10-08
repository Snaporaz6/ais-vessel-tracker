import { resolve } from "node:path";
import { z } from "zod";
import { MEDITERRANEAN_BBOX, SPOOL_LIMIT_BYTES } from "./config.js";

/** Validated runtime settings; called after dotenv by the entrypoint. */
export function runtimeConfig({
  requireAIS = true,
}: { requireAIS?: boolean } = {}) {
  const schema = z.object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    STORAGE_DIR: z.string().default("./data"),
    STORAGE_MAX_BYTES: z.coerce
      .number()
      .int()
      .min(1_048_576)
      .max(SPOOL_LIMIT_BYTES)
      .default(SPOOL_LIMIT_BYTES),
    CORS_ORIGINS: z.string().default("http://localhost:3000"),
    DEMO_MODE: z.enum(["true", "false"]).default("false"),
    INGESTOR_BBOX: z
      .string()
      .default(
        `${MEDITERRANEAN_BBOX.latMin},${MEDITERRANEAN_BBOX.lonMin},${MEDITERRANEAN_BBOX.latMax},${MEDITERRANEAN_BBOX.lonMax}`,
      ),
    SUPABASE_URL: z.string().url().optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
    AISSTREAM_API_KEY: z.string().min(1).optional(),
    ADMIN_TOKEN: z.string().min(24).optional(),
    S3_ENDPOINT: z.string().url().optional(),
    S3_BUCKET: z.string().optional(),
    S3_REGION: z.string().default("auto"),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    S3_FORCE_PATH_STYLE: z.enum(["true", "false"]).default("false"),
  });
  const parsed = schema.safeParse({
    ...process.env,
    API_PORT: process.env.PORT ?? process.env.API_PORT,
  });
  if (!parsed.success)
    throw new Error(
      `Invalid settings: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`,
    );
  const env = parsed.data;
  const bbox = env.INGESTOR_BBOX.split(",").map(Number);
  if (
    bbox.length !== 4 ||
    !bbox.every(Number.isFinite) ||
    bbox[0]! >= bbox[2]! ||
    bbox[1]! >= bbox[3]! ||
    bbox[0]! < 30 ||
    bbox[2]! > 46 ||
    bbox[1]! < -6 ||
    bbox[3]! > 36.5
  ) {
    throw new Error(
      "INGESTOR_BBOX must be latMin,lonMin,latMax,lonMax within the Mediterranean coverage",
    );
  }
  const origins = env.CORS_ORIGINS.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (
    !origins.length ||
    origins.some((origin) => {
      try {
        return new URL(origin).origin !== origin;
      } catch {
        return true;
      }
    })
  )
    throw new Error("Invalid CORS_ORIGINS");
  const demo = env.DEMO_MODE === "true";
  if (demo && env.NODE_ENV === "production")
    throw new Error("DEMO_MODE cannot run in production");
  if (!demo) {
    const missing = [
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "AISSTREAM_API_KEY",
      "S3_ENDPOINT",
      "S3_BUCKET",
      "S3_ACCESS_KEY_ID",
      "S3_SECRET_ACCESS_KEY",
    ].filter(
      (k) => (k !== "AISSTREAM_API_KEY" || requireAIS) && !process.env[k],
    );
    if (missing.length)
      throw new Error(`Missing settings: ${missing.join(", ")}`);
  }
  if (env.NODE_ENV === "production" && !env.ADMIN_TOKEN)
    throw new Error("Missing settings: ADMIN_TOKEN");
  return {
    ...env,
    demo,
    bbox: bbox as [number, number, number, number],
    origins,
    storageDir: resolve(env.STORAGE_DIR),
  };
}

export type RuntimeConfig = ReturnType<typeof runtimeConfig>;

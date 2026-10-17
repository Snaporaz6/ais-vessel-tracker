import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import { TABLES } from "./repository.js";
import { checksum } from "./object-store.js";
import { decodeGroup, type MetadataGroup } from "./metadata-groups.js";
import type { ReferenceIndex } from "./reference-index.js";

/** Read a verified backup without retaining its expanded snapshot in the API process. */
export async function collectBackupReferences(
  data: Buffer,
  expected: string,
  refs: Pick<ReferenceIndex, "add">,
  checkDeadline: () => void = () => {},
) {
  if (checksum(data) !== expected) throw new Error("BACKUP_CHECKSUM_MISMATCH");
  const [{ parserStream }, { pick }, { streamValues }] = await Promise.all([
    import("stream-json"),
    import("stream-json/filters/pick.js"),
    import("stream-json/streamers/stream-values.js"),
  ]);
  const tables = new Set<string>(),
    groups = new Set<string>();
  let processingError: unknown;
  let version: unknown,
    groupsPresent = false;
  const archive = (row: Record<string, unknown>) => {
    if (
      typeof row.object_key !== "string" ||
      !row.object_key.startsWith("tracks/")
    )
      throw new Error("BACKUP_INVALID");
    refs.add(row.object_key);
  };
  try {
    await pipeline(
      Readable.from([data]),
      createGunzip(),
      parserStream(),
      pick.asStream({
        filter: (path, token) => {
          try {
            checkDeadline();
            if (path.length === 1 && path[0] === "version") return true;
            if (path.length === 1 && path[0] === "metadata_groups") {
              if (token.name !== "startArray")
                throw new Error("BACKUP_INVALID");
              groupsPresent = true;
            }
            if (
              path.length === 2 &&
              path[0] === "snapshot" &&
              TABLES.includes(path[1] as (typeof TABLES)[number])
            ) {
              if (token.name !== "startArray")
                throw new Error("BACKUP_INVALID");
              tables.add(String(path[1]));
            }
            return (
              (path.length === 3 &&
                path[0] === "snapshot" &&
                path[1] === "track_archives" &&
                typeof path[2] === "number") ||
              (path.length === 2 &&
                path[0] === "metadata_groups" &&
                typeof path[1] === "number")
            );
          } catch (error) {
            processingError ??= error;
            throw error;
          }
        },
      }),
      streamValues.asStream(),
      async (values) => {
        try {
          for await (const { value } of values) {
            checkDeadline();
            if (typeof value === "number") {
              version = value;
              continue;
            }
            if (!value || typeof value !== "object" || Array.isArray(value))
              throw new Error("BACKUP_INVALID");
            if ("kind" in value) {
              const group = value as MetadataGroup,
                key = `${group.kind}:${group.mmsi}:${group.month}`;
              if (groups.has(key)) throw new Error("BACKUP_INVALID");
              groups.add(key);
              const rows = decodeGroup(group);
              if (group.kind === "track_archives")
                for (const row of rows) archive(row);
            } else archive(value);
          }
        } catch (error) {
          processingError ??= error;
          throw error;
        }
      },
    );
  } catch (error) {
    throw processingError ?? error;
  }
  if (
    ![1, 2].includes(version as number) ||
    tables.size !== TABLES.length ||
    (groupsPresent && version !== 2)
  )
    throw new Error("BACKUP_INVALID");
}

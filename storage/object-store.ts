import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile,
  rename,
  unlink,
  readdir,
} from "node:fs/promises";
import { resolve, dirname } from "node:path";
import type { RuntimeConfig } from "../shared/runtime.js";
export const checksum = (data: Uint8Array) =>
  createHash("sha256").update(data).digest("hex");
export interface ObjectStore {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  health(): Promise<void>;
  list(prefix: string): AsyncIterable<{ key: string; modified: Date }>;
}
export class BucketStore implements ObjectStore {
  readonly client: S3Client;
  readonly bucket: string;
  constructor(c: RuntimeConfig) {
    this.bucket = c.S3_BUCKET!;
    this.client = new S3Client({
      endpoint: c.S3_ENDPOINT,
      region: c.S3_REGION,
      forcePathStyle: c.S3_FORCE_PATH_STYLE === "true",
      credentials: {
        accessKeyId: c.S3_ACCESS_KEY_ID!,
        secretAccessKey: c.S3_SECRET_ACCESS_KEY!,
      },
      maxAttempts: 3,
    });
  }
  async put(key: string, data: Buffer) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: "application/gzip",
        Metadata: { sha256: checksum(data) },
      }),
      { abortSignal: AbortSignal.timeout(30_000) },
    );
  }
  async get(key: string) {
    const obj = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { abortSignal: AbortSignal.timeout(30_000) },
    );
    if (!obj.Body) throw new Error("ARCHIVE_UNAVAILABLE");
    return Buffer.from(await obj.Body.transformToByteArray());
  }
  async delete(key: string) {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      { abortSignal: AbortSignal.timeout(30_000) },
    );
  }
  async health() {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }), {
      abortSignal: AbortSignal.timeout(10_000),
    });
  }
  async *list(prefix: string) {
    let token: string | undefined;
    do {
      const res = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: token,
        }),
        { abortSignal: AbortSignal.timeout(30_000) },
      );
      for (const obj of res.Contents ?? [])
        if (obj.Key && obj.LastModified)
          yield { key: obj.Key, modified: obj.LastModified };
      token = res.NextContinuationToken;
    } while (token);
  }
}
export class FileObjectStore implements ObjectStore {
  constructor(readonly root: string) {}
  private path(key: string) {
    const path = resolve(this.root, key);
    if (!path.startsWith(resolve(this.root) + "/"))
      throw new Error("INVALID_OBJECT_KEY");
    return path;
  }
  async put(key: string, data: Buffer) {
    const path = this.path(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path + ".tmp", data, { flush: true });
    await rename(path + ".tmp", path);
  }
  async get(key: string) {
    return readFile(this.path(key));
  }
  async delete(key: string) {
    await unlink(this.path(key)).catch((e) => {
      if (e.code !== "ENOENT") throw e;
    });
  }
  async health() {
    await mkdir(this.root, { recursive: true });
  }
  async *list(prefix: string): AsyncIterable<{ key: string; modified: Date }> {
    const { stat } = await import("node:fs/promises");
    async function* walk(
      root: string,
      relative: string,
    ): AsyncIterable<{ key: string; modified: Date }> {
      for (const e of await readdir(resolve(root, relative), {
        withFileTypes: true,
      })) {
        const key = [relative, e.name].filter(Boolean).join("/");
        if (e.isDirectory()) yield* walk(root, key);
        else yield { key, modified: (await stat(resolve(root, key))).mtime };
      }
    }
    for await (const item of walk(this.root, ""))
      if (item.key.startsWith(prefix)) yield item;
  }
}

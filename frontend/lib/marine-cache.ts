import type { MarineCollection } from "./marine-map-layers";
export const MARINE_DAY_MS = 86_400_000;
export const WARNING_REFRESH_MS = 30 * 60_000;
type Entry = {
  key: string;
  value: MarineCollection;
  expires: number;
  at: number;
  bytes: number;
};
const memory = new Map<string, Entry>();
const pending = new Map<string, Promise<MarineCollection>>();
let database: Promise<IDBDatabase | null> | undefined;
function db() {
  database ??= new Promise<IDBDatabase | null>((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    const request = indexedDB.open("ais-marine-cache-v2", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("responses", { keyPath: "key" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
  return database;
}
async function read(key: string): Promise<Entry | undefined> {
  const local = memory.get(key);
  if (local && local.expires > Date.now()) return local;
  try {
    const database = await db();
    if (!database) return;
    return await new Promise((resolve) => {
      const request = database
        .transaction("responses")
        .objectStore("responses")
        .get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(undefined);
    });
  } catch {
    return;
  }
}
async function write(entry: Entry) {
  memory.delete(entry.key);
  memory.set(entry.key, entry);
  let size = [...memory.values()].reduce((sum, row) => sum + row.bytes, 0);
  for (const [key, row] of memory) {
    if (memory.size <= 48 && size <= 24 * 1024 * 1024) break;
    memory.delete(key);
    size -= row.bytes;
  }
  try {
    const database = await db();
    if (!database) return;
    const store = database
      .transaction("responses", "readwrite")
      .objectStore("responses");
    store.put(entry);
    const all = store.getAll();
    all.onsuccess = () => {
      const rows: Entry[] = all.result.sort(
        (a: Entry, b: Entry) => b.at - a.at,
      );
      let bytes = 0,
        count = 0;
      for (const row of rows) {
        bytes += row.bytes;
        count++;
        if (row.expires <= Date.now() || bytes > 24 * 1024 * 1024 || count > 48)
          store.delete(row.key);
      }
    };
  } catch {
    /* Private browsing or a quota failure must not break the map. */
  }
}
/** Daily regional snapshots survive reloads. Dynamic warnings expire at half-hour boundaries. */
export async function cachedMarineRequest(
  url: string,
  ttl: number,
  signal: AbortSignal,
): Promise<MarineCollection> {
  const entry = await read(url);
  if (entry && entry.expires > Date.now())
    return {
      ...entry.value,
      metadata: { ...entry.value.metadata, cacheExpiresAt: entry.expires },
    };
  const current = pending.get(url);
  if (current)
    return current.catch((error) => {
      if (!signal.aborted && error?.name === "AbortError")
        return cachedMarineRequest(url, ttl, signal);
      throw error;
    });
  const request = (async () => {
    const response = await fetch(url, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(35_000)]),
    });
    const value = await response.json();
    if (
      !response.ok ||
      value?.type !== "FeatureCollection" ||
      !Array.isArray(value.features) ||
      value.metadata?.status === "error"
    )
      throw new Error("mapData.unavailable");
    const now = Date.now();
    // Partial provider responses are retried later, without erasing existing geometry.
    const duration =
      value.metadata?.status === "partial" && ttl === MARINE_DAY_MS
        ? 15 * 60_000
        : ttl;
    const expires =
      ttl === MARINE_DAY_MS && duration === MARINE_DAY_MS
        ? (Math.floor(now / MARINE_DAY_MS) + 1) * MARINE_DAY_MS
        : ttl === WARNING_REFRESH_MS
          ? (Math.floor(now / ttl) + 1) * ttl
          : now + duration;
    await write({
      key: url,
      value,
      expires,
      at: now,
      bytes: JSON.stringify(value).length * 2,
    });
    return {
      ...value,
      metadata: { ...value.metadata, cacheExpiresAt: expires },
    } as MarineCollection;
  })().finally(() => pending.delete(url));
  pending.set(url, request);
  return request;
}
export type Bounds = [number, number, number, number];
export function containsBounds(outer: Bounds, inner: Bounds) {
  if (inner[0] > inner[2] || outer[0] > outer[2]) return false;
  return (
    outer[0] <= inner[0] &&
    outer[1] <= inner[1] &&
    outer[2] >= inner[2] &&
    outer[3] >= inner[3]
  );
}
/** Fixed grid keys keep nearby pan/zoom requests in the same daily provider cache. */
export function regionalBounds(
  bounds: Bounds,
  layer: string,
  zoom: number,
): Bounds {
  if (bounds[0] > bounds[2]) return bounds;
  const step = ["anchorages", "navigation"].includes(layer)
    ? 0.25
    : zoom >= 6
      ? 1
      : zoom >= 3
        ? 10
        : 30;
  return [
    Math.max(-180, Math.floor(bounds[0] / step) * step),
    Math.max(-85, Math.floor(bounds[1] / step) * step),
    Math.min(180, Math.ceil(bounds[2] / step) * step),
    Math.min(85, Math.ceil(bounds[3] / step) * step),
  ];
}
export function marineDetailZoom(layer: string, zoom: number) {
  if (layer === "ports") return zoom >= 6 ? 6 : 2;
  if (layer === "eez") return zoom >= 5 ? 5 : 1;
  return Math.max(
    zoom >= 6 ? 6 : 1,
    ["anchorages", "navigation"].includes(layer)
      ? 9
      : layer === "wrecks"
        ? 7
        : 1,
  );
}

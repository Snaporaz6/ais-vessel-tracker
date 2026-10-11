export const runtime = "nodejs";
export const maxDuration = 20;

const SOURCE = "https://ows.emodnet-humanactivities.eu/wms";
const YEAR = "2024-01-01T00:00:00Z";
const WORLD_HALF = 20037508.342789244;
const MAX_BYTES = 1_000_000;
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const CACHE_MS = 86_400_000;
const MAX_CACHE_BYTES = 16 * 1024 * 1024;
const MAX_CACHE_ENTRIES = 128;
const MAX_PENDING = 32;

const cache = new Map<string, { expiresAt: number; png: Uint8Array }>();
const pending = new Map<string, Promise<Uint8Array>>();
let cachedBytes = 0;

class DensityBusy extends Error {}

function cachePng(key: string, png: Uint8Array): void {
  const previous = cache.get(key);
  if (previous) {
    cachedBytes -= previous.png.byteLength;
    cache.delete(key);
  }
  while (
    cache.size &&
    (cache.size >= MAX_CACHE_ENTRIES ||
      cachedBytes + png.byteLength > MAX_CACHE_BYTES)
  ) {
    const oldest = cache.keys().next().value!;
    cachedBytes -= cache.get(oldest)!.png.byteLength;
    cache.delete(oldest);
  }
  cache.set(key, { expiresAt: Date.now() + CACHE_MS, png });
  cachedBytes += png.byteLength;
}

type Context = { params: Promise<{ z: string; x: string; y: string }> };

async function readPng(response: Response): Promise<Uint8Array> {
  if (
    !response.body ||
    Number(response.headers.get("content-length")) > MAX_BYTES
  )
    throw new Error("Density tile too large or empty");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) throw new Error("Density tile too large");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  if (!PNG_SIGNATURE.every((byte, index) => output[index] === byte))
    throw new Error("Density provider did not return PNG");
  // A valid source response must be the requested 256×256 image, not a larger
  // image (or an unrelated PNG) supplied by a misconfigured upstream server.
  if (
    output.byteLength < 24 ||
    String.fromCharCode(...output.slice(12, 16)) !== "IHDR"
  )
    throw new Error("Invalid density PNG header");
  const dimensions = new DataView(
    output.buffer,
    output.byteOffset,
    output.byteLength,
  );
  if (dimensions.getUint32(16) !== 256 || dimensions.getUint32(20) !== 256)
    throw new Error("Unexpected density PNG dimensions");
  return output;
}

async function fetchPng(upstream: URL): Promise<Uint8Array> {
  // Do not let Next.js cache a HTTP-200 WMS exception document or invalid PNG.
  // Only successfully validated images enter our memory cache and response CDN.
  const response = await fetch(upstream, {
    signal: AbortSignal.timeout(12_000),
    cache: "no-store",
    redirect: "error",
    headers: { Accept: "image/png" },
  });
  if (
    !response.ok ||
    !response.headers.get("content-type")?.toLowerCase().startsWith("image/png")
  )
    throw new Error("Density provider unavailable");
  return readPng(response);
}

export async function GET(_request: Request, context: Context) {
  const params = await context.params;
  if (
    ![params.z, params.x, params.y].every((value) =>
      /^(0|[1-9]\d{0,4})$/.test(value),
    )
  ) {
    return Response.json(
      { error: "Tessera non valida." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  const zoom = Number(params.z);
  const x = Number(params.x);
  const y = Number(params.y);
  const count = 2 ** zoom;
  if (zoom > 12 || x >= count || y >= count) {
    return Response.json(
      { error: "Tessera non valida." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  const step = (WORLD_HALF * 2) / count;
  const west = -WORLD_HALF + x * step;
  const east = west + step;
  const north = WORLD_HALF - y * step;
  const south = north - step;
  const upstream = new URL(SOURCE);
  upstream.search = new URLSearchParams({
    service: "WMS",
    version: "1.1.1",
    request: "GetMap",
    layers: "vesseldensity_allavg",
    styles: "VesselDensity",
    format: "image/png",
    transparent: "true",
    srs: "EPSG:3857",
    bbox: [west, south, east, north].join(","),
    width: "256",
    height: "256",
    time: YEAR,
  }).toString();
  try {
    const key = `${zoom}/${x}/${y}`;
    const hit = cache.get(key);
    let png = hit && hit.expiresAt > Date.now() ? hit.png : undefined;
    if (!png) {
      let promise = pending.get(key);
      if (!promise) {
        if (pending.size >= MAX_PENDING)
          throw new DensityBusy("Too many density source requests");
        promise = fetchPng(upstream);
        pending.set(key, promise);
      }
      try {
        png = await promise;
        cachePng(key, png);
      } finally {
        pending.delete(key);
      }
    }
    return new Response(png.buffer as ArrayBuffer, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control":
          "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400",
        "X-Content-Type-Options": "nosniff",
        "X-Density-Year": "2024",
        "X-Density-Units": "vessel-hours/km2/month",
        "X-Density-Coverage":
          "European waters and neighbouring areas; variable AIS coverage",
        "X-Density-Limitation":
          "2024 satellite AIS coverage reduced from June; not live traffic",
      },
    });
  } catch (error) {
    const busy = error instanceof DensityBusy;
    return Response.json(
      { error: "Densità storica temporaneamente non disponibile." },
      {
        status: busy ? 503 : 502,
        headers: busy
          ? { "Cache-Control": "no-store", "Retry-After": "15" }
          : { "Cache-Control": "no-store" },
      },
    );
  }
}

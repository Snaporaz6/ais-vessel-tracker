import type { Feature, Point } from "geojson";

export const runtime = "nodejs";
export const maxDuration = 20;

const SOURCE = "https://marine-api.open-meteo.com/v1/marine";
const SOURCE_DOCUMENTATION =
  "https://open-meteo.com/en/docs/marine-weather-api";
const CACHE_MS = 15 * 60_000;
const MAX_ENTRIES = 128;
const MAX_RESPONSE_BYTES = 128_000;
const ALLOWED_HOURS = new Set([0, 3, 6, 12, 24]);
const NO_STORE = { "Cache-Control": "no-store" };

interface MarineLocation {
  latitude?: number;
  longitude?: number;
  hourly_units?: Record<string, string>;
  hourly?: {
    time?: string[];
    wave_height?: (number | null)[];
    ocean_current_velocity?: (number | null)[];
    ocean_current_direction?: (number | null)[];
  };
}

interface MarineProperties {
  kind: "marine_forecast";
  source: "Open-Meteo Marine";
  source_url: string;
  sourceUrl: string;
  name: string;
  wave_height: number | null;
  ocean_current_velocity: number | null;
  ocean_current_direction: number | null;
  waveHeight: number | null;
  currentVelocity: number | null;
  currentDirection: number | null;
  forecastAt: string;
  requested_latitude: number;
  requested_longitude: number;
  forecast_valid_time: string;
  sampled: true;
}

type MarineFeature = Feature<Point, MarineProperties>;
type Sample = { latitude: number; longitude: number };
interface ForecastCollection {
  type: "FeatureCollection";
  features: MarineFeature[];
  metadata: {
    status: "ready" | "partial" | "empty";
    message: string;
    minZoom: number;
    complete: false;
    count: number;
    source: string;
    sourceUrl: string;
    license: string;
    licenseUrl: string;
    attribution: string;
    attributionUrls: string[];
    coverage: string;
    fetchedAt: string;
    updatedAt: null;
    modelRunTime: null;
    forecastValidTime: string;
    requestedHours: number;
    units: {
      wave_height: string;
      ocean_current_velocity: string;
      ocean_current_direction: string;
    };
    sampling: string;
    requestedSampleCount: number;
    availableSampleCount: number;
    unavailableSampleCount: number;
    duplicateSampleCount: number;
    quantizationDegrees: number;
    notForNavigation: true;
    limitations: string[];
  };
}

const cache = new Map<
  string,
  { expiresAt: number; data: ForecastCollection }
>();
const pending = new Map<string, Promise<ForecastCollection>>();
// These conservative instance budgets complement provider quotas and CDN caching.
// A distributed deployment still needs provider usage monitoring/shared limits.
let minuteBudget = { startedAt: 0, units: 0 };
let hourBudget = { startedAt: 0, units: 0 };
let dayBudget = { startedAt: 0, units: 0 };

class BudgetExceeded extends Error {}

function reserveBudget(units: number): void {
  const now = Date.now();
  if (now - minuteBudget.startedAt >= 60_000)
    minuteBudget = { startedAt: now, units: 0 };
  if (now - hourBudget.startedAt >= 3_600_000)
    hourBudget = { startedAt: now, units: 0 };
  if (now - dayBudget.startedAt >= 86_400_000)
    dayBudget = { startedAt: now, units: 0 };
  if (
    minuteBudget.units + units > 90 ||
    hourBudget.units + units > 500 ||
    dayBudget.units + units > 2000
  ) {
    throw new BudgetExceeded("Marine provider request budget exceeded");
  }
  minuteBudget.units += units;
  hourBudget.units += units;
  dayBudget.units += units;
}

function normalizeLongitude(longitude: number): number {
  return ((((longitude + 180) % 360) + 360) % 360) - 180;
}

function finiteValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function velocityKnots(value: unknown, unit?: string): number | null {
  const speed = finiteValue(value);
  if (speed === null || speed < 0) return null;
  if (unit === "kn" || unit === "knots" || unit === "kt") return speed;
  if (unit === "km/h") return speed / 1.852;
  if (unit === "m/s") return speed * 1.9438444924406;
  if (unit === "mph") return speed * 0.86897624190065;
  return null;
}

function currentDegrees(value: unknown, unit?: string): number | null {
  const direction = finiteValue(value);
  if (
    !["°", "degree", "degrees"].includes(unit ?? "") ||
    direction === null ||
    direction < 0 ||
    direction > 360
  )
    return null;
  return direction === 360 ? 0 : direction;
}

function parseRequest(
  params: URLSearchParams,
): {
  samples: Sample[];
  hours: number;
  quantization: number;
  validTime: string;
} | null {
  const parts = (params.get("bbox") ?? "").split(",");
  if (parts.some((part) => !part.trim())) return null;
  const bbox = parts.map(Number);
  const zoom = Number(params.get("zoom") ?? 4);
  const hours = Number(params.get("hours") ?? 0);
  if (
    bbox.length !== 4 ||
    !bbox.every(Number.isFinite) ||
    !Number.isFinite(zoom) ||
    zoom < 0 ||
    zoom > 24 ||
    !ALLOWED_HOURS.has(hours)
  )
    return null;
  const [west, south, east, north] = bbox;
  if (
    Math.abs(west) > 540 ||
    Math.abs(east) > 540 ||
    south < -90 ||
    north > 90 ||
    south >= north
  )
    return null;
  const rawSpan = east - west;
  const span = Math.abs(rawSpan) >= 360 ? 360 : ((rawSpan % 360) + 360) % 360;
  if (span <= 0) return null;
  const quantization =
    zoom <= 2 ? 5 : zoom <= 4 ? 2 : zoom <= 6 ? 0.5 : zoom <= 8 ? 0.25 : 0.1;
  const quantize = (value: number) =>
    Number((Math.round(value / quantization) * quantization).toFixed(4));
  const samples: Sample[] = [];
  const keys = new Set<string>();
  for (const vertical of [1 / 6, 1 / 2, 5 / 6]) {
    for (const horizontal of [1 / 6, 1 / 2, 5 / 6]) {
      const latitude = Math.max(
        -90,
        Math.min(90, quantize(south + (north - south) * vertical)),
      );
      const longitude = normalizeLongitude(quantize(west + span * horizontal));
      const key = `${latitude},${longitude}`;
      if (!keys.has(key)) {
        keys.add(key);
        samples.push({ latitude, longitude });
      }
    }
  }
  // Hourly model validity is UTC. Acquisition time is a separate field.
  const validTime = new Date(
    Math.floor(Date.now() / 3_600_000) * 3_600_000 + hours * 3_600_000,
  ).toISOString();
  return { samples, hours, quantization, validTime };
}

async function readBounded(response: Response): Promise<string> {
  if (
    !response.body ||
    Number(response.headers.get("content-length")) > MAX_RESPONSE_BYTES
  )
    throw new Error("Marine response too large or empty");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES)
        throw new Error("Marine response too large");
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

async function loadForecast(
  input: NonNullable<ReturnType<typeof parseRequest>>,
): Promise<ForecastCollection> {
  reserveBudget(input.samples.length);
  const upstream = new URL(SOURCE);
  upstream.searchParams.set(
    "latitude",
    input.samples.map((sample) => sample.latitude).join(","),
  );
  upstream.searchParams.set(
    "longitude",
    input.samples.map((sample) => sample.longitude).join(","),
  );
  upstream.searchParams.set(
    "hourly",
    "wave_height,ocean_current_velocity,ocean_current_direction",
  );
  upstream.searchParams.set("velocity_unit", "kn");
  upstream.searchParams.set("length_unit", "metric");
  upstream.searchParams.set("timezone", "UTC");
  upstream.searchParams.set("cell_selection", "sea");
  upstream.searchParams.set("start_hour", input.validTime.slice(0, 16));
  upstream.searchParams.set("end_hour", input.validTime.slice(0, 16));
  const response = await fetch(upstream, {
    signal: AbortSignal.timeout(12_000),
    cache: "no-store",
    redirect: "error",
    headers: { Accept: "application/json" },
  });
  if (response.status === 429)
    throw new BudgetExceeded("Marine provider quota reached");
  if (!response.ok) throw new Error(`Marine provider HTTP ${response.status}`);
  const raw: unknown = JSON.parse(await readBounded(response));
  const locations: MarineLocation[] = Array.isArray(raw)
    ? raw
    : [raw as MarineLocation];
  if (locations.length !== input.samples.length)
    throw new Error("Unexpected marine location count");
  const features: MarineFeature[] = [];
  const seenCells = new Set<string>();
  let unavailable = 0;
  let duplicate = 0;
  let partial = false;
  for (const [locationIndex, location] of locations.entries()) {
    if (!location || typeof location !== "object")
      throw new Error("Invalid marine location");
    const latitude = finiteValue(location.latitude);
    const longitude = finiteValue(location.longitude);
    if (
      latitude === null ||
      longitude === null ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180 ||
      !Array.isArray(location.hourly?.time)
    )
      throw new Error("Invalid marine grid coordinates or time");
    const timeIndex = location.hourly.time.findIndex(
      (time) =>
        typeof time === "string" &&
        Date.parse(`${time.replace(/Z$/, "")}Z`) ===
          Date.parse(input.validTime),
    );
    if (timeIndex < 0)
      throw new Error("Requested forecast hour absent from marine response");
    const wave = finiteValue(location.hourly.wave_height?.[timeIndex]);
    const waveHeight =
      location.hourly_units?.wave_height === "m" && wave !== null && wave >= 0
        ? wave
        : null;
    const velocity = velocityKnots(
      location.hourly.ocean_current_velocity?.[timeIndex],
      location.hourly_units?.ocean_current_velocity,
    );
    const currentDirection = currentDegrees(
      location.hourly.ocean_current_direction?.[timeIndex],
      location.hourly_units?.ocean_current_direction,
    );
    partial ||=
      waveHeight === null || velocity === null || currentDirection === null;
    if (waveHeight === null && velocity === null && currentDirection === null) {
      unavailable += 1;
      continue;
    }
    const key = `${longitude},${latitude}`;
    if (seenCells.has(key)) {
      duplicate += 1;
      continue;
    }
    seenCells.add(key);
    const requested = input.samples[locationIndex];
    features.push({
      type: "Feature",
      id: `marine-${latitude}-${longitude}`,
      geometry: { type: "Point", coordinates: [longitude, latitude] },
      properties: {
        kind: "marine_forecast",
        source: "Open-Meteo Marine",
        source_url: SOURCE_DOCUMENTATION,
        sourceUrl: SOURCE_DOCUMENTATION,
        name: "Ocean conditions",
        wave_height: waveHeight,
        ocean_current_velocity: velocity,
        ocean_current_direction: currentDirection,
        waveHeight,
        currentVelocity: velocity,
        currentDirection,
        forecastAt: input.validTime,
        requested_latitude: requested.latitude,
        requested_longitude: requested.longitude,
        forecast_valid_time: input.validTime,
        sampled: true,
      },
    });
  }
  const fetchedAt = new Date().toISOString();
  return {
    type: "FeatureCollection",
    features,
    metadata: {
      status: features.length ? (partial ? "partial" : "ready") : "empty",
      message: features.length
        ? partial
          ? "mapData.partial"
          : "mapData.available"
        : "mapData.noFeatures",
      minZoom: 2,
      complete: false,
      count: features.length,
      source: "Open-Meteo Marine",
      sourceUrl: SOURCE_DOCUMENTATION,
      license: "CC BY 4.0",
      licenseUrl: "https://open-meteo.com/en/licence",
      attribution:
        "Open-Meteo; DWD; Météo-France / Copernicus Marine. Viewport point sampling by AIS Vessel Tracker.",
      attributionUrls: [
        "https://open-meteo.com/",
        "https://www.dwd.de/",
        "https://marine.copernicus.eu/",
      ],
      coverage:
        "Global model coverage; sampled grid cells only, availability varies by variable and location",
      fetchedAt,
      updatedAt: null,
      modelRunTime: null,
      forecastValidTime: input.validTime,
      requestedHours: input.hours,
      units: {
        wave_height: "m",
        ocean_current_velocity: "kn",
        ocean_current_direction: "°",
      },
      sampling:
        "Up to nine quantized viewport samples; coordinates are the provider's selected model grid cells",
      requestedSampleCount: input.samples.length,
      availableSampleCount: features.length,
      unavailableSampleCount: unavailable,
      duplicateSampleCount: duplicate,
      quantizationDegrees: input.quantization,
      notForNavigation: true,
      limitations: [
        "Forecast model values, not measurements from vessels",
        "No continuous surface or spatial interpolation is produced by this endpoint",
        "Sea cell selection is a preference, not proof that a requested point is at sea",
        "Currents have approximately 8 km model resolution; coastal and harbour accuracy is limited",
        "Current direction indicates where the water flows towards; absent values remain null",
        "fetchedAt is acquisition time; the provider model issue time is not available in this response",
      ],
    },
  };
}

export async function GET(request: Request) {
  const input = parseRequest(new URL(request.url).searchParams);
  if (!input)
    return Response.json(
      { error: "Area o intervallo di previsione non valido." },
      { status: 400, headers: NO_STORE },
    );
  const key = `${input.validTime}|${input.hours}|${input.quantization}|${input.samples.map((sample) => `${sample.latitude},${sample.longitude}`).join(";")}`;
  // hours=0/+n are relative to this UTC hour. Neither memory nor CDN/browser
  // caches should reuse the preceding hour's relative forecast after rollover.
  const hourEndsAt =
    Date.parse(input.validTime) - input.hours * 3_600_000 + 3_600_000;
  try {
    const hit = cache.get(key);
    let data = hit && hit.expiresAt > Date.now() ? hit.data : undefined;
    if (!data) {
      let promise = pending.get(key);
      if (!promise) {
        promise = loadForecast(input);
        pending.set(key, promise);
      }
      try {
        data = await promise;
        if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value!);
        cache.set(key, {
          expiresAt: Math.min(Date.now() + CACHE_MS, hourEndsAt),
          data,
        });
      } finally {
        pending.delete(key);
      }
    }
    const remainingSeconds = Math.max(
      0,
      Math.floor((hourEndsAt - Date.now()) / 1000),
    );
    const sharedMaxAge = Math.min(900, remainingSeconds);
    const maxAge = Math.min(120, sharedMaxAge);
    return Response.json(data, {
      headers: {
        "Cache-Control":
          sharedMaxAge > 0
            ? `public, max-age=${maxAge}, s-maxage=${sharedMaxAge}, must-revalidate`
            : "no-store",
        "X-Marine-Valid-Time": data.metadata.forecastValidTime,
      },
    });
  } catch (error) {
    const limited = error instanceof BudgetExceeded;
    return Response.json(
      {
        error: limited
          ? "Previsioni temporaneamente limitate. Riprova più tardi."
          : "Fonte delle previsioni marine temporaneamente non disponibile.",
        type: "FeatureCollection",
        features: [],
        metadata: {
          status: "error",
          message: "mapData.unavailable",
          minZoom: 2,
          complete: false,
          count: 0,
          source: "Open-Meteo Marine",
          sourceUrl: SOURCE_DOCUMENTATION,
          notForNavigation: true,
        },
      },
      {
        status: limited ? 429 : 502,
        headers: limited ? { ...NO_STORE, "Retry-After": "900" } : NO_STORE,
      },
    );
  }
}

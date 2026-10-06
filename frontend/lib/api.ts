import type {
  Vessel,
  VesselDetail,
  VesselPosition,
  PortCall,
  PortInfo,
  LiveMapResponse,
  TrackMetadata,
} from "../../shared/types";
import { HISTORY_TIERS } from "../../shared/config";
import { trackGaps } from "../../shared/history";
export function apiURL(path: string) {
  const base =
    typeof window === "undefined"
      ? process.env.API_BASE_URL ||
        process.env.NEXT_PUBLIC_API_URL ||
        "http://localhost:3001"
      : process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
  return base.replace(/\/$/, "") + path;
}
async function response(path: string, signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(15_000);
  const res = await fetch(apiURL(path), {
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    ...(typeof window === "undefined"
      ? { next: { revalidate: 60 } }
      : { cache: "no-store" as const }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || `Servizio non disponibile (${res.status})`);
  }
  return res;
}
export async function fetchAPI<T>(
  path: string,
  signal?: AbortSignal,
): Promise<T> {
  return (await response(path, signal)).json();
}
export const searchVessels = (q: string, signal?: AbortSignal) =>
  fetchAPI<Vessel[]>(`/api/search?q=${encodeURIComponent(q)}`, signal);
export const getVessel = (m: string, signal?: AbortSignal) =>
  fetchAPI<VesselDetail>(`/api/vessel/${m}`, signal);
export const getPortCalls = (m: string, signal?: AbortSignal) =>
  fetchAPI<PortCall[]>(`/api/vessel/${m}/portcalls`, signal);
export const getPort = (name: string) =>
  fetchAPI<PortInfo>(`/api/port/${encodeURIComponent(name)}`);
export const getLiveVessels = (bbox: string, signal?: AbortSignal) =>
  fetchAPI<LiveMapResponse>(
    `/api/map/live?bbox=${encodeURIComponent(bbox)}`,
    signal,
  );
export async function getTrack(m: string, days = 30, signal?: AbortSignal) {
  const res = await response(`/api/vessel/${m}/track?days=${days}`, signal),
    points = (await res.json()) as VesselPosition[];
  const metadata: TrackMetadata = {
    requested_days: days,
    first_at: res.headers.get("X-Track-First-At") || null,
    last_at: res.headers.get("X-Track-Last-At") || null,
    available_points: Number(
      res.headers.get("X-Track-Available-Points") || points.length,
    ),
    returned_points: points.length,
    sampled: res.headers.get("X-Track-Sampled") === "true",
    gaps: trackGaps(points),
    intervals: JSON.parse(
      res.headers.get("X-Track-Sampling") || JSON.stringify(HISTORY_TIERS),
    ),
  };
  return { points, metadata };
}

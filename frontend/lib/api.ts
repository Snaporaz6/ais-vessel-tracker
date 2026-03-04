const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

/** Fetch helper con error handling */
async function fetchAPI<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `API error ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function searchVessels(query: string) {
  return fetchAPI(`/api/search?q=${encodeURIComponent(query)}`);
}

export function getVessel(mmsi: string) {
  return fetchAPI(`/api/vessel/${mmsi}`);
}

export function getTrack(mmsi: string, days = 30) {
  return fetchAPI(`/api/vessel/${mmsi}/track?days=${days}`);
}

export function getPortCalls(mmsi: string) {
  return fetchAPI(`/api/vessel/${mmsi}/portcalls`);
}

export function getLiveVessels(bbox: string) {
  return fetchAPI(`/api/map/live?bbox=${bbox}`);
}

export function getAnomalies(mmsi: string) {
  return fetchAPI(`/api/vessel/${mmsi}/anomalies`);
}

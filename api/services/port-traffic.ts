import { getDistance } from "geolib";
import catalog from "../../shared/ports-catalog.json";
import type { Context } from "../../server/context.js";
import type {
  PortTraffic,
  PortTrafficRow,
  PortCall,
  Vessel,
} from "../../shared/types.js";
import { NotFoundError } from "../../shared/errors.js";
const ports = new Map(catalog.map((port) => [port.id, port]));
const RADIUS = 3000,
  HOURS = 48;
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
const aliases: Record<string, string[]> = {
  ITGOA: ["GENOA", "GENOVA"],
  ITNAP: ["NAPLES", "NAPOLI"],
  FRMRS: ["MARSEILLE", "MARSEILLES"],
};
export async function portTraffic(
  c: Context,
  id: string,
): Promise<PortTraffic> {
  const port = ports.get(id);
  if (!port) throw new NotFoundError("Porto NGA", id);
  const now = Date.now(),
    cutoff = now - HOURS * 3600_000;
  const inCoverage =
    port.lat >= 30 && port.lat <= 46 && port.lon >= -6 && port.lon <= 36.5;
  const result: PortTraffic = {
    port,
    expected: [],
    arrivals: [],
    departures: [],
    in_port: [],
    scope: inCoverage ? "mediterranean_observations" : "outside_ais_coverage",
    source: {
      ...c.ingestor.source,
      outages: c.ingestor.source.outages.slice(-20),
    },
    generated_at: new Date(now).toISOString(),
    radius_m: RADIUS,
    events_hours: HOURS,
    results_limited: false,
    movements_status: "ok",
  };
  if (
    result.source.last_message_at &&
    now - Date.parse(result.source.last_message_at) > 60_000 &&
    result.source.status === "live"
  )
    result.source.status = "stale";
  if (!inCoverage) return result;
  const code = normalize(port.unlocode ?? "");
  const names = new Set(
    [normalize(port.name), code, ...(aliases[code] ?? [])].filter(Boolean),
  );
  const row = (
    mmsi: string,
    basis: PortTrafficRow["basis"],
    event_at: string | null = null,
  ): PortTrafficRow => {
    const vessel: Vessel | undefined = c.live.vessels.get(mmsi),
      pos = c.live.positions.get(mmsi);
    return {
      mmsi,
      name: vessel?.name ?? mmsi,
      ship_type: vessel?.ship_type ?? "other",
      flag: vessel?.flag ?? "",
      imo: vessel?.imo ?? null,
      length: vessel?.length ?? null,
      width: vessel?.width ?? null,
      destination: vessel?.destination ?? null,
      eta: vessel?.eta ?? null,
      observed_at: pos?.timestamp ?? null,
      event_at,
      distance_nm: pos
        ? getDistance(
            { latitude: port.lat, longitude: port.lon },
            { latitude: pos.lat, longitude: pos.lon },
          ) / 1852
        : null,
      basis,
    };
  };
  for (const pos of c.live.positions.values()) {
    if (now - Date.parse(pos.timestamp) > 10 * 60_000) continue;
    const vessel = c.live.vessels.get(pos.mmsi);
    const distance = getDistance(
      { latitude: port.lat, longitude: port.lon },
      { latitude: pos.lat, longitude: pos.lon },
    );
    const stopped =
      distance <= RADIUS &&
      (pos.nav_status === "moored" ||
        pos.nav_status === "at_anchor" ||
        (pos.speed !== null && pos.speed <= 0.5));
    if (stopped) result.in_port.push(row(pos.mmsi, "nearby_position"));
    // Exact destination/code matches only; no inferred route or commercial schedule.
    if (
      !stopped &&
      vessel?.destination &&
      now - Date.parse(vessel.updated_at) <= 24 * 3600_000 &&
      names.has(normalize(vessel.destination))
    )
      result.expected.push(row(pos.mmsi, "declared_destination"));
  }
  let recorded: PortCall[] = [];
  try {
    recorded = await c.repo.portAreaStops(port.lat, port.lon, RADIUS);
    result.results_limited = recorded.length > 200;
  } catch {
    result.movements_status = "unavailable";
  }
  const unique = new Map<string, PortCall>();
  for (const stop of [
    ...recorded.slice(0, 200),
    ...Object.values(c.ingestor.stops.active),
  ]) {
    if (
      getDistance(
        { latitude: port.lat, longitude: port.lon },
        { latitude: stop.port_lat, longitude: stop.port_lon },
      ) <= RADIUS &&
      stop.duration_hours >= 0.5
    )
      unique.set(stop.id ?? `${stop.mmsi}:${stop.arrived_at}`, stop);
  }
  for (const stop of unique.values()) {
    if (Date.parse(stop.arrived_at) >= cutoff)
      result.arrivals.push(
        row(stop.mmsi, "detected_stop_start", stop.arrived_at),
      );
    if (
      stop.departed_at &&
      !stop.uncertain_departure &&
      Date.parse(stop.departed_at) >= cutoff
    )
      result.departures.push(
        row(stop.mmsi, "detected_stop_end", stop.departed_at),
      );
  }
  result.expected.sort((a, b) => (a.eta ?? "z").localeCompare(b.eta ?? "z"));
  result.in_port.sort(
    (a, b) => (a.distance_nm ?? Infinity) - (b.distance_nm ?? Infinity),
  );
  for (const group of [result.arrivals, result.departures])
    group.sort((a, b) => (b.event_at ?? "").localeCompare(a.event_at ?? ""));
  for (const group of [
    "expected",
    "arrivals",
    "departures",
    "in_port",
  ] as const) {
    if (result[group].length > 200) result.results_limited = true;
    result[group] = result[group].slice(0, 200);
  }
  return result;
}

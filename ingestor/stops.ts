import { getDistance } from "geolib";
import type { PortCall, VesselPosition } from "../shared/types.js";
import { TRACK_GAP_MS, STOP_RADIUS_METERS } from "../shared/config.js";
export class StopDetector {
  active: Record<string, PortCall> = {};
  private emitted: Record<string, number> = {};
  constructor(readonly persist: (stop: PortCall) => void) {}
  observe(p: VesselPosition) {
    const previous = this.active[p.mmsi],
      at = Date.parse(p.timestamp);
    const gap =
      previous && at - Date.parse(previous.last_seen_at!) > TRACK_GAP_MS;
    const moved =
      previous &&
      getDistance(
        { latitude: p.lat, longitude: p.lon },
        { latitude: previous.port_lat, longitude: previous.port_lon },
      ) > STOP_RADIUS_METERS;
    if (previous && (gap || moved || p.speed === null || p.speed > 1)) {
      previous.departed_at = previous.last_seen_at!;
      previous.uncertain_departure = Boolean(gap || p.speed === null);
      if (previous.duration_hours >= 0.5) this.persist({ ...previous });
      delete this.active[p.mmsi];
      delete this.emitted[p.mmsi];
    }
    if (p.speed === null || p.speed > 1) return;
    let stop = this.active[p.mmsi];
    if (!stop) {
      stop = {
        id: `${p.mmsi}:${p.timestamp}`,
        mmsi: p.mmsi,
        port_name: `${p.lat.toFixed(2)},${p.lon.toFixed(2)}`,
        port_lat: p.lat,
        port_lon: p.lon,
        arrived_at: p.timestamp,
        departed_at: null,
        duration_hours: 0,
        last_seen_at: p.timestamp,
        uncertain_departure: false,
      };
      this.active[p.mmsi] = stop;
    }
    stop.last_seen_at = p.timestamp;
    stop.duration_hours = (at - Date.parse(stop.arrived_at)) / 3600_000;
    if (
      stop.duration_hours >= 0.5 &&
      at - (this.emitted[p.mmsi] ?? 0) >= 300_000
    ) {
      this.persist({ ...stop });
      this.emitted[p.mmsi] = at;
    }
  }
  expire(now = Date.now()) {
    for (const [mmsi, stop] of Object.entries(this.active))
      if (now - Date.parse(stop.last_seen_at!) > TRACK_GAP_MS) {
        stop.departed_at = stop.last_seen_at!;
        stop.uncertain_departure = true;
        if (stop.duration_hours >= 0.5) this.persist({ ...stop });
        delete this.active[mmsi];
        delete this.emitted[mmsi];
      }
  }
}

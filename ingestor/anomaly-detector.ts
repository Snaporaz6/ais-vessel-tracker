import { getDistance } from "geolib";
import { randomUUID } from "node:crypto";
import type {
  VesselPosition,
  ShipType,
  AnomalyEvent,
  SourceState,
} from "../shared/types.js";
import { ANOMALY_COOLDOWN_MS } from "../shared/config.js";
const SPEED: Record<ShipType, number> = {
  cargo: 20,
  tanker: 18,
  passenger: 30,
  fishing: 15,
  tug: 16,
  pleasure: 25,
  military: 35,
  other: 25,
};
export class AnomalyDetector {
  cooldown: Record<string, number> = {};
  check(
    prev: VesselPosition | undefined,
    next: VesselPosition,
    type: ShipType,
    outages: SourceState["outages"],
  ): AnomalyEvent[] {
    if (!prev) return [];
    const from = Date.parse(prev.timestamp),
      to = Date.parse(next.timestamp),
      seconds = (to - from) / 1000;
    if (seconds <= 0) return [];
    const distance = getDistance(
      { latitude: prev.lat, longitude: prev.lon },
      { latitude: next.lat, longitude: next.lon },
    );
    const speed = distance / 1852 / (seconds / 3600),
      max = SPEED[type] * 1.5,
      out: AnomalyEvent[] = [];
    const emit = (
      kind: AnomalyEvent["type"],
      details: Record<string, unknown>,
    ) => {
      const key = `${next.mmsi}:${kind}`;
      if (to - (this.cooldown[key] ?? 0) < ANOMALY_COOLDOWN_MS) return;
      this.cooldown[key] = to;
      out.push({
        id: randomUUID(),
        mmsi: next.mmsi,
        type: kind,
        detected_at: next.timestamp,
        details,
      });
    };
    const serviceGap = outages.some(
      (o) => Date.parse(o.from) < to && (!o.to || Date.parse(o.to) > from),
    );
    if (seconds >= 6 * 3600 && !serviceGap)
      emit("dark_activity", {
        gap_hours: seconds / 3600,
        meaning:
          "Interruzione nelle osservazioni della singola nave; non prova di spegnimento AIS.",
      });
    if (distance / 1852 > 1000 && seconds < 3600)
      emit("impossible_movement", {
        distance_nm: distance / 1852,
        gap_seconds: seconds,
      });
    else if (seconds <= 1800 && distance > 100 && speed > max)
      emit("speed_anomaly", {
        implied_speed_knots: speed,
        max_expected: max,
        ship_type: type,
        gap_seconds: seconds,
      });
    return out;
  }
}

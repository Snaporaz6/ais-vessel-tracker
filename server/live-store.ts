import type { Vessel, VesselPosition, AnomalyType } from "../shared/types.js";
export const unknownVessel = (mmsi: string): Vessel => ({
  mmsi,
  name: "Nome non disponibile",
  imo: null,
  flag: "",
  ship_type: "other",
  length: null,
  width: null,
  max_speed: null,
  destination: null,
  eta: null,
  updated_at: new Date(0).toISOString(),
});
export class LiveStore {
  vessels = new Map<string, Vessel>();
  positions = new Map<string, VesselPosition>();
  flags = new Map<string, { type: AnomalyType; at: string }[]>();
  metadata(patch: Partial<Vessel> & { mmsi: string }) {
    const old = this.vessels.get(patch.mmsi) ?? unknownVessel(patch.mmsi);
    // A delayed static report must not replace information from a newer report.
    if (patch.updated_at && patch.updated_at < old.updated_at) return old;
    const next = { ...old, ...patch };
    this.vessels.set(next.mmsi, next);
    return next;
  }
  latest(pos: VesselPosition) {
    const previous = this.positions.get(pos.mmsi);
    if (!previous || previous.timestamp < pos.timestamp)
      this.positions.set(pos.mmsi, pos);
  }
  prune(now = Date.now()) {
    const cutoff = new Date(now - 90 * 86400_000).toISOString();
    for (const [m, p] of this.positions)
      if (p.timestamp < cutoff) {
        this.positions.delete(m);
        this.flags.delete(m);
        this.vessels.delete(m);
      }
  }
}

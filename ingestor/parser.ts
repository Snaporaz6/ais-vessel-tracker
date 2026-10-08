import type {
  Vessel,
  VesselPosition,
  ShipType,
  NavStatus,
} from "../shared/types.js";
type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {};
const num = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
const clean = (v: unknown) =>
  typeof v === "string"
    ? v.replace(/@/g, "").trim().slice(0, 200) || null
    : null;
const NAV: Record<number, NavStatus> = {
  0: "underway_engine",
  1: "at_anchor",
  2: "not_under_command",
  5: "moored",
  6: "aground",
  7: "fishing",
  8: "underway_sailing",
};
export function mapShipType(c: number): ShipType {
  if (c >= 70 && c <= 79) return "cargo";
  if (c >= 80 && c <= 89) return "tanker";
  if (c >= 60 && c <= 69) return "passenger";
  if (c === 30) return "fishing";
  if ([31, 32, 52].includes(c)) return "tug";
  if ([36, 37].includes(c)) return "pleasure";
  if (c === 35) return "military";
  return "other";
}
export function normalizeTimestamp(
  raw: unknown,
  now = Date.now(),
): string | null {
  if (typeof raw !== "string") return null;
  const s = raw
    .trim()
    .replace(/\s*UTC\s*$/, "")
    .replace(/(\.\d{3})\d+/, "$1")
    .replace(/\s+([+-]\d{4})$/, "$1")
    .replace(/([+-])(\d{2})(\d{2})$/, "$1$2:$3")
    .replace(/^(\d{4}-\d{2}-\d{2})\s+/, "$1T");
  const t = Date.parse(s);
  return Number.isFinite(t) && t >= Date.UTC(2000, 0) && t <= now + 300_000
    ? new Date(t).toISOString()
    : null;
}
function eta(value: unknown, timestamp: string) {
  const e = obj(value),
    m = num(e.Month),
    d = num(e.Day),
    h = num(e.Hour),
    n = num(e.Minute);
  if (
    m === null ||
    d === null ||
    h === null ||
    n === null ||
    ![m, d, h, n].every(Number.isInteger) ||
    m < 1 ||
    m > 12 ||
    d < 1 ||
    d > 31 ||
    h < 0 ||
    h > 23 ||
    n < 0 ||
    n > 59
  )
    return null;
  const now = new Date(timestamp);
  let year = now.getUTCFullYear(),
    date = new Date(Date.UTC(year, m - 1, d, h, n));
  if (date.getTime() < now.getTime() - 30 * 86400_000)
    date = new Date(Date.UTC(++year, m - 1, d, h, n));
  return date.getUTCMonth() === m - 1 && date.getUTCDate() === d
    ? date.toISOString()
    : null;
}
export type ParseResult =
  | {
      type: "position";
      position: VesselPosition;
      vessel: Partial<Vessel> & { mmsi: string };
    }
  | { type: "static"; vessel: Partial<Vessel> & { mmsi: string } };
export function parseAISMessage(
  raw: string,
  now = Date.now(),
): ParseResult | null {
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    return null;
  }
  const msg = obj(decoded),
    meta = obj(msg.MetaData),
    message = obj(msg.Message),
    kind = msg.MessageType;
  const mmsi = String(meta.MMSI_String ?? meta.MMSI ?? "");
  if (!/^[1-9]\d{8}$/.test(mmsi)) return null;
  const timestamp = normalizeTimestamp(meta.time_utc, now);
  if (!timestamp) return null;
  const body = typeof kind === "string" ? obj(message[kind]) : {};
  if (!Object.keys(body).length || body.Valid === false) return null;
  if (body.UserID !== undefined && String(body.UserID) !== mmsi) return null;
  const vessel: Partial<Vessel> & { mmsi: string } = {
    mmsi,
    updated_at: timestamp,
  };
  const name = clean(meta.ShipName);
  if (name) vessel.name = name;
  if (
    [
      "PositionReport",
      "StandardClassBPositionReport",
      "ExtendedClassBPositionReport",
    ].includes(String(kind))
  ) {
    const lat = num(body.Latitude ?? meta.Latitude ?? meta.latitude),
      lon = num(body.Longitude ?? meta.Longitude ?? meta.longitude);
    if (
      lat === null ||
      lon === null ||
      Math.abs(lat) > 90 ||
      Math.abs(lon) > 180
    )
      return null;
    const sog = num(body.Sog),
      cog = num(body.Cog),
      hd = num(body.TrueHeading);
    if (kind === "ExtendedClassBPositionReport")
      Object.assign(vessel, staticFields(body, timestamp));
    return {
      type: "position",
      vessel,
      position: {
        mmsi,
        lat,
        lon,
        speed: sog !== null && sog >= 0 && sog < 102.3 ? sog : null,
        course: cog !== null && cog >= 0 && cog < 360 ? cog : null,
        heading: hd !== null && hd >= 0 && hd < 360 ? hd : null,
        nav_status: NAV[num(body.NavigationalStatus) ?? 15] ?? "unknown",
        timestamp,
      },
    };
  }
  if (kind === "ShipStaticData")
    return {
      type: "static",
      vessel: {
        ...vessel,
        ...staticFields(body, timestamp),
        destination: clean(body.Destination),
        eta: eta(body.Eta, timestamp),
      },
    };
  if (kind === "StaticDataReport") {
    const a = obj(body.ReportA),
      b = obj(body.ReportB);
    const fields =
      body.PartNumber === 0 || body.PartNumber === false
        ? a.Valid === false
          ? {}
          : a
        : body.PartNumber === 1 || body.PartNumber === true
          ? b.Valid === false
            ? {}
            : b
          : {
              ...(a.Valid === false ? {} : a),
              ...(b.Valid === false ? {} : b),
            };
    return {
      type: "static",
      vessel: { ...vessel, ...staticFields(fields, timestamp) },
    };
  }
  return null;
}
function staticFields(body: Obj, timestamp: string): Partial<Vessel> {
  const out: Partial<Vessel> = { updated_at: timestamp },
    name = clean(body.Name);
  if (name) out.name = name;
  const code = num(body.Type ?? body.ShipType);
  if (code !== null && code !== 0) out.ship_type = mapShipType(code);
  const imo = num(body.ImoNumber);
  if (imo && /^\d{7}$/.test(String(imo))) out.imo = String(imo);
  const d = obj(body.Dimension),
    a = num(d.A),
    b = num(d.B),
    c = num(d.C),
    e = num(d.D);
  if (
    a !== null &&
    b !== null &&
    a >= 0 &&
    b >= 0 &&
    a + b > 0 &&
    a + b <= 1022
  )
    out.length = a + b;
  if (c !== null && e !== null && c >= 0 && e >= 0 && c + e > 0 && c + e <= 126)
    out.width = c + e;
  return out;
}

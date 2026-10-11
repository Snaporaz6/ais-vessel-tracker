import ngaSnapshot from "../../../public/warnings/nga-smaps-snapshot.json";
import maradSnapshot from "../../../public/warnings/marad-advisories-snapshot.json";
import ukmtoSnapshot from "../../../public/warnings/ukmto-incidents-snapshot.json";
import {
  NGA_DISCLAIMER,
  UKMTO_ATTRIBUTION,
  warningIntersectsBounds,
  type MaritimeWarningCollection,
  type MaritimeWarningFeature,
  type MaritimeWarningProperties,
  type MaritimeWarningSource,
  type WarningBounds,
  type WarningKind,
  type WarningPosition,
  type WarningSourceStatus,
  type UnmappedMaritimeReport,
} from "../../../lib/maritime-warnings";

export const runtime = "nodejs";
export const maxDuration = 20;

const NGA_PAGE = "https://msi.nga.mil/NavWarnings";
const MARAD_PAGE = "https://www.maritime.dot.gov/msci-advisories";
const UKMTO_PAGE = "https://www.ukmto.org/recent-incidents";
const NAV_AREAS = ["4", "12", "A", "P", "C"] as const;
const CACHE_MS = 30 * 60_000;
const FRESH_MS = 30 * 60_000;
const MAX_FEATURES = 1200;
const MAX_SOURCE_BYTES = 2_000_000;
const MONTHS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];
const KINDS: WarningKind[] = [
  "piracy",
  "attack",
  "incident",
  "restriction",
  "navigation",
];

interface NgaMessage {
  outgoingID?: string;
  msgID?: string;
  category?: string;
  createdOn?: string;
  ingestDate?: string;
  cancelledOn?: string | null;
  cancelledOnDB?: string | null;
  msgSqncNumber?: number;
  msgType?: string;
  usNavArea?: string;
  status?: string;
  msgText?: string;
}

interface MaradAdvisory {
  id: string;
  name: string;
  validFrom: string;
  validUntil: string;
  sourceUrl: string;
  status: string;
}

interface SourceBatch {
  features: MaritimeWarningFeature[];
  source: MaritimeWarningSource;
  unmappedReports?: UnmappedMaritimeReport[];
}

let cached: { expiresAt: number; batches: SourceBatch[] } | undefined;
let pending: Promise<SourceBatch[]> | undefined;

function cleanText(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#0*45;/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchBounded(url: URL): Promise<string> {
  // All URLs are constructed below from these two fixed, public source hosts.
  if (
    !["msi.nga.mil", "www.maritime.dot.gov"].includes(url.hostname) ||
    url.protocol !== "https:"
  ) {
    throw new Error("Source is not allowlisted");
  }
  const response = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
    redirect: "error",
    headers: {
      "User-Agent": "AIS-vessel-tracker-source-research/1.0",
      Accept: "application/json,text/html;q=0.9",
    },
  });
  if (!response.ok || !response.body)
    throw new Error(`Source HTTP ${response.status}`);
  if (Number(response.headers.get("content-length")) > MAX_SOURCE_BYTES)
    throw new Error("Source response too large");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let output = "";
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_SOURCE_BYTES)
        throw new Error("Source response too large");
      output += decoder.decode(value, { stream: true });
    }
    return output + decoder.decode();
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

function parseNgaDate(text: string, defaultYear?: number): string | null {
  const match = text.match(
    /\b(\d{2})(\d{2})(\d{2})Z\s+([A-Z]{3})(?:\s+(\d{2}|\d{4}))?\b/i,
  );
  if (!match) return null;
  const month = MONTHS.indexOf(match[4].toUpperCase());
  const suppliedYear = match[5] ? Number(match[5]) : defaultYear;
  if (
    month < 0 ||
    suppliedYear === undefined ||
    Number(match[2]) > 23 ||
    Number(match[3]) > 59
  )
    return null;
  const year = suppliedYear < 100 ? 2000 + suppliedYear : suppliedYear;
  const date = new Date(
    Date.UTC(year, month, Number(match[1]), Number(match[2]), Number(match[3])),
  );
  return date.getUTCMonth() === month && date.getUTCDate() === Number(match[1])
    ? date.toISOString()
    : null;
}

function parseCoordinates(
  text: string,
): { position: WarningPosition; offset: number }[] {
  const coordinates: { position: WarningPosition; offset: number }[] = [];
  const normalised = text.replace(/[\u2010-\u2015\u2212]/g, "-");
  const expression =
    /\b(\d{1,2})[-°](\d{1,2}(?:[.,]\d+)?)\s*['′’]?\s*([NS])\s*[,;/]?\s*(\d{1,3})[-°](\d{1,2}(?:[.,]\d+)?)\s*['′’]?\s*([EW])\b/gi;
  for (const match of normalised.matchAll(expression)) {
    const latitudeMinutes = Number(match[2].replace(",", "."));
    const longitudeMinutes = Number(match[5].replace(",", "."));
    const latitude =
      (Number(match[1]) + latitudeMinutes / 60) *
      (match[3].toUpperCase() === "S" ? -1 : 1);
    const longitude =
      (Number(match[4]) + longitudeMinutes / 60) *
      (match[6].toUpperCase() === "W" ? -1 : 1);
    if (
      latitudeMinutes >= 60 ||
      longitudeMinutes >= 60 ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180
    )
      continue;
    coordinates.push({
      position: [longitude, latitude],
      offset: match.index ?? 0,
    });
    if (coordinates.length >= 100) break;
  }
  return coordinates;
}

function classify(category: string, text: string): WarningKind {
  if (/PIRACY|ARMED ROBBERY|HIJACK|KIDNAP/.test(category)) return "piracy";
  if (/ATTACK|HOSTILE|COMBAT|TERROR/.test(category)) return "attack";
  if (
    /PORT CLOSURE|RESTRICT|GUNNERY|MISSILE|ROCKET|MINING EXERCISE|HAZARDOUS OPERATIONS|SPECIAL OPERATIONS/.test(
      category,
    )
  )
    return "restriction";
  if (
    /CASUALTY|COLLISION|SUNK|ABANDONED|DERELICT|DISABLED|MAN OVERBOARD/.test(
      category,
    )
  )
    return "incident";
  // Free-text classification deliberately avoids "attack" for military exercises or mentioned past events.
  if (/\bPIRACY\b|\bARMED ROBBERY\b/.test(text) && category === "GENERAL")
    return "piracy";
  return "navigation";
}

function normaliseNga(
  rows: NgaMessage[],
  updatedAt: string,
  sourceStatus: WarningSourceStatus,
): MaritimeWarningFeature[] {
  const features: MaritimeWarningFeature[] = [];
  const now = Date.now();
  const fresh =
    sourceStatus === "live" && now - Date.parse(updatedAt) <= FRESH_MS;
  for (const row of rows) {
    const text = (row.msgText ?? "").slice(0, 16_000);
    const category = (row.category ?? "NAVIGATION WARNING").toUpperCase();
    if (
      !text ||
      /^(ADMIN|INFORCE BULLETIN|NAVAREA IV RIG LIST)$/.test(category)
    )
      continue;
    // Cancellation paragraphs can mention the coordinates of previous messages. Do not map them.
    let body = text.split(/\n\s*\d+\.\s*CANCEL\b/i)[0];
    if (category === "PORT CLOSURE") {
      body = body
        .split(/(?=\n\s*\d+\.\s)/)
        .filter(
          (section) =>
            !/\bPORT\(?S?\)?\s+(?:HAVE\s+|ARE\s+)?(?:RE-?OPENED|OPEN\b(?!\s+WITH\s+RESTRICTIONS))/i.test(
              section,
            ),
        )
        .join("\n");
    }
    // Recommended transit tracks are not locations of mines, attacks or other hazards.
    // The text remains available at the source; route/line geometry needs a separate schema.
    if (/\bTRACKLINE\b|\bTRAKLINE\b/i.test(body)) continue;
    const coordinates = parseCoordinates(body);
    if (!coordinates.length) continue;
    const validFrom = parseNgaDate(row.createdOn ?? "") || parseNgaDate(text);
    const cancellation = text.match(/CANCEL THIS (?:MSG|MESSAGE)\s+([^\n.]+)/i);
    let validUntil = cancellation
      ? parseNgaDate(
          cancellation[1],
          validFrom ? new Date(validFrom).getUTCFullYear() : undefined,
        )
      : null;
    const cancellationHasYear =
      cancellation && /Z\s+[A-Z]{3}\s+\d{2,4}\b/i.test(cancellation[1]);
    if (
      validUntil &&
      validFrom &&
      !cancellationHasYear &&
      Date.parse(validUntil) < Date.parse(validFrom)
    ) {
      const date = new Date(validUntil);
      date.setUTCFullYear(date.getUTCFullYear() + 1);
      validUntil = date.toISOString();
    }
    const cancelled =
      /CANCELLED|CANCELED/.test(row.status ?? "") ||
      Boolean(row.cancelledOn || row.cancelledOnDB);
    const lastKnownInForce =
      !cancelled &&
      /^(?:INFORCE|ACTIVE)$/.test((row.status ?? "").trim().toUpperCase());
    const expired = validUntil !== null && Date.parse(validUntil) < now;
    const active =
      fresh &&
      lastKnownInForce &&
      !expired &&
      (!validFrom || Date.parse(validFrom) <= now);
    const id = `nga-${row.outgoingID || row.msgID || `${row.msgType}-${row.msgSqncNumber}-${validFrom}`}`;
    const properties: MaritimeWarningProperties = {
      id,
      name: `${row.msgType || row.usNavArea || "NGA"} ${row.msgSqncNumber ?? ""} — ${category}`,
      kind: classify(category, text.toUpperCase()),
      source: "NGA SMAPS",
      sourceUrl: NGA_PAGE,
      occurredAt: null,
      validFrom,
      validUntil,
      updatedAt,
      status: cancelled
        ? "cancelled"
        : expired
          ? "expired"
          : active
            ? "active"
            : "stale",
      active,
      lastKnownInForce,
      eventStatus:
        /POSSIBLE|SUSPECT|UNCONFIRMED/.test(category) ||
        /\b(?:POSSIBLE|SUSPECTED|UNCONFIRMED)\s+(?:MINE|ATTACK|PIRACY|ACTIVITY|EXPLOSION|TSUNAMI|OBSTRUCTION)/i.test(
          text,
        )
          ? "suspected"
          : "reported",
      severity: "unspecified",
      officialSeverity: null,
      precision: "reported_position",
      description: text,
      category,
      sourceStatus,
      regional: false,
    };
    // A single explicit list of area vertices is supported. Multiple areas and circles
    // stay as source points; they must never be joined into a fabricated polygon.
    const areaSections = [...body.matchAll(/\bAREA\s+BOUND(?:ED)?\s+BY\b/gi)];
    if (
      areaSections.length === 1 &&
      !/\bRADIUS\b|\bTRACKLINE\b/.test(body.toUpperCase())
    ) {
      const section = body
        .slice((areaSections[0].index ?? 0) + areaSections[0][0].length)
        .split(/\n\s*\d+\.\s/)[0];
      const vertices = parseCoordinates(section).map((item) => item.position);
      if (vertices.length >= 3 && vertices.length <= 60) {
        const first = vertices[0];
        const last = vertices[vertices.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1])
          vertices.push([...first]);
        features.push({
          type: "Feature",
          id,
          geometry: { type: "Polygon", coordinates: [vertices] },
          properties: { ...properties, precision: "reported_area" },
        });
        continue;
      }
    }
    const seen = new Set<string>();
    for (const { position } of coordinates) {
      const key = position.join(",");
      if (seen.has(key)) continue;
      seen.add(key);
      const pointId = `${id}-${seen.size}`;
      features.push({
        type: "Feature",
        id: pointId,
        geometry: { type: "Point", coordinates: position },
        properties: { ...properties, id: pointId },
      });
    }
  }
  return features;
}

function maradPosition(name: string): WarningPosition | null {
  if (/black sea/i.test(name)) return [34, 43.5];
  if (/persian gulf|hormuz/i.test(name)) return [56.4, 25.5];
  if (/red sea/i.test(name)) return [42.5, 16.5];
  if (/gulf of aden|arabian sea/i.test(name)) return [52, 13];
  if (/gulf of guinea/i.test(name)) return [3, 2];
  // A worldwide advisory has no incident point and is counted as unmapped metadata.
  return null;
}

function parseMarad(html: string): MaradAdvisory[] {
  if (!/Active Advisories/i.test(html) || !/Cancelled Advisories/i.test(html))
    throw new Error("Unrecognised MARAD listing");
  const section = html.slice(
    html.indexOf("Active Advisories"),
    html.indexOf("Cancelled Advisories"),
  );
  const rows: MaradAdvisory[] = [];
  for (const match of section.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...match[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(
      (cell) => cell[1],
    );
    if (cells.length < 4 || cleanText(cells[1]) !== "Active") continue;
    const link = cells[0].match(/href=["']([^"']+)["']/i);
    const name = cleanText(cells[0]);
    const id = name.match(/^\d{4}-\d{3}/)?.[0];
    const from = cleanText(cells[2]).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    const until = cleanText(cells[3]).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!link || !id || !from || !until) continue;
    const sourceUrl = new URL(link[1], MARAD_PAGE);
    if (
      sourceUrl.hostname !== "www.maritime.dot.gov" ||
      !sourceUrl.pathname.startsWith("/msci/")
    )
      continue;
    rows.push({
      id,
      name,
      sourceUrl: sourceUrl.href,
      status: "Active",
      validFrom: `${from[3]}-${from[1]}-${from[2]}T00:00:00.000Z`,
      validUntil: `${until[3]}-${until[1]}-${until[2]}T23:59:59.999Z`,
    });
  }
  return rows;
}

function normaliseMarad(
  rows: MaradAdvisory[],
  updatedAt: string,
  sourceStatus: WarningSourceStatus,
): MaritimeWarningFeature[] {
  return rows.flatMap((row) => {
    const position = maradPosition(row.name);
    if (!position) return [];
    const expired = Date.parse(row.validUntil) < Date.now();
    const active =
      sourceStatus === "live" &&
      row.status === "Active" &&
      !expired &&
      Date.parse(row.validFrom) <= Date.now();
    const id = `marad-${row.id}`;
    return [
      {
        type: "Feature" as const,
        id,
        geometry: { type: "Point" as const, coordinates: position },
        properties: {
          id,
          name: row.name,
          kind: /piracy|robbery|kidnap/i.test(row.name)
            ? ("piracy" as const)
            : ("attack" as const),
          source: "US MARAD",
          sourceUrl: row.sourceUrl,
          occurredAt: null,
          validFrom: row.validFrom,
          validUntil: row.validUntil,
          updatedAt,
          status: expired
            ? ("expired" as const)
            : active
              ? ("active" as const)
              : ("stale" as const),
          active,
          lastKnownInForce: row.status === "Active",
          eventStatus: "not_applicable" as const,
          severity: "unspecified" as const,
          officialSeverity: null,
          precision: "approximate_region" as const,
          category: "REGIONAL SECURITY ADVISORY",
          sourceStatus,
          regional: true,
          description:
            "Regional advisory for commercial shipping. This marker identifies the named region, not an attack position or an official area boundary. Open the source for current status and full guidance.",
        },
      },
    ];
  });
}

async function loadNgaArea(
  area: (typeof NAV_AREAS)[number],
): Promise<SourceBatch> {
  const url = new URL("https://msi.nga.mil/api/publications/smaps");
  url.search = new URLSearchParams({
    navArea: area,
    status: "active",
    category: "14",
    output: "json",
  }).toString();
  let rows: NgaMessage[];
  let updatedAt: string;
  let status: WarningSourceStatus;
  const checkedAt = new Date().toISOString();
  try {
    const response: unknown = JSON.parse(await fetchBounded(url));
    if (
      !response ||
      typeof response !== "object" ||
      !("smaps" in response) ||
      !Array.isArray(response.smaps)
    )
      throw new Error("Invalid SMAPS data");
    rows = response.smaps.slice(0, 1200).filter((row): row is NgaMessage => {
      if (!row || typeof row !== "object" || typeof row.msgText !== "string")
        return false;
      const stringFields = [
        "outgoingID",
        "msgID",
        "category",
        "createdOn",
        "ingestDate",
        "cancelledOn",
        "cancelledOnDB",
        "msgType",
        "usNavArea",
        "status",
      ];
      return (
        stringFields.every(
          (key) =>
            row[key] === undefined ||
            row[key] === null ||
            typeof row[key] === "string",
        ) &&
        (row.msgSqncNumber === undefined ||
          typeof row.msgSqncNumber === "number")
      );
    });
    updatedAt = new Date().toISOString();
    status = "live";
  } catch {
    const areaNames: Record<string, string> = {
      "4": "NAVAREA IV",
      "12": "NAVAREA XII",
      A: "HYDROLANT",
      P: "HYDROPAC",
      C: "HYDROARC",
    };
    rows = (ngaSnapshot.smaps as NgaMessage[]).filter(
      (row) =>
        row.msgType === areaNames[area] ||
        row.usNavArea
          ?.split(",")
          .some((name) => name.trim() === areaNames[area]),
    );
    updatedAt = ngaSnapshot.retrievedAt;
    status =
      Date.now() - Date.parse(updatedAt) <= FRESH_MS ? "snapshot" : "stale";
  }
  const features = normaliseNga(rows, updatedAt, status);
  const mapped = new Set(
    features.map((feature) => feature.properties.id.replace(/-\d+$/, "")),
  );
  const publishedDates = rows
    .map(
      (row) =>
        parseNgaDate(row.createdOn ?? "") || parseNgaDate(row.msgText ?? ""),
    )
    .filter((date): date is string => date !== null)
    .sort();
  return {
    features,
    source: {
      source: `NGA SMAPS ${area}`,
      sourceUrl: NGA_PAGE,
      status,
      updatedAt: publishedDates.at(-1) ?? null,
      fetchedAt: updatedAt,
      checkedAt,
      complete: false,
      coverage: "warnings.ngaCoverage",
      count: features.length,
      unmappedCount: Math.max(0, rows.length - mapped.size),
      message: status === "live" ? "warnings.ngaLive" : "warnings.ngaSnapshot",
    },
  };
}

async function loadMarad(): Promise<SourceBatch> {
  let rows: MaradAdvisory[];
  let updatedAt: string;
  let status: WarningSourceStatus;
  const checkedAt = new Date().toISOString();
  try {
    rows = parseMarad(await fetchBounded(new URL(MARAD_PAGE)));
    updatedAt = new Date().toISOString();
    status = "live";
  } catch {
    rows = maradSnapshot.advisories;
    updatedAt = maradSnapshot.retrievedAt;
    status =
      Date.now() - Date.parse(updatedAt) <= FRESH_MS ? "snapshot" : "stale";
  }
  const features = normaliseMarad(rows, updatedAt, status);
  return {
    features,
    source: {
      source: "US MARAD",
      sourceUrl: MARAD_PAGE,
      status,
      updatedAt:
        rows
          .map((row) => row.validFrom)
          .sort()
          .at(-1) ?? null,
      fetchedAt: updatedAt,
      checkedAt,
      complete: false,
      coverage: "warnings.maradCoverage",
      count: features.length,
      unmappedCount: rows.length - features.length,
      message:
        status === "live" ? "warnings.maradLive" : "warnings.maradSnapshot",
    },
  };
}

function loadUkmtoSnapshot(): SourceBatch {
  const features: MaritimeWarningFeature[] = [];
  const unmappedReports: UnmappedMaritimeReport[] = [];
  for (const record of ukmtoSnapshot.reports) {
    const kind = record.kind as WarningKind;
    const eventStatus =
      record.eventStatus as MaritimeWarningProperties["eventStatus"];
    const sourceUrl = record.sourceUrl ?? UKMTO_PAGE;
    if (!record.position) {
      unmappedReports.push({
        id: record.id,
        name: record.name,
        kind,
        source: "UKMTO",
        sourceUrl,
        occurredAt: record.occurredAt,
        reportedAt: record.reportedAt,
        eventStatus,
        description: record.description,
      });
      continue;
    }
    // This is the explicit last known vessel position printed in report 045-26.
    // Distances/bearings in other reports are not converted to incident coordinates.
    const position = record.position;
    if (
      position.length !== 2 ||
      position.some((value) => !Number.isFinite(value)) ||
      Math.abs(position[0]) > 180 ||
      Math.abs(position[1]) > 90
    )
      continue;
    features.push({
      type: "Feature",
      id: record.id,
      geometry: { type: "Point", coordinates: [position[0], position[1]] },
      properties: {
        id: record.id,
        name: record.name,
        kind,
        source: "UKMTO",
        sourceUrl,
        occurredAt: record.occurredAt,
        reportedAt: record.reportedAt,
        validFrom: null,
        validUntil: null,
        updatedAt: ukmtoSnapshot.retrievedAt,
        status: "historical",
        active: false,
        lastKnownInForce: false,
        eventStatus,
        severity: "unspecified",
        officialSeverity: null,
        precision: "reported_position",
        locationRole: "last_reported_vessel_position",
        description: record.description,
        category: record.category,
        sourceStatus: "snapshot",
        regional: false,
      },
    });
  }
  return {
    features,
    unmappedReports,
    source: {
      source: "UKMTO",
      sourceUrl: UKMTO_PAGE,
      status: "snapshot",
      complete: false,
      updatedAt: ukmtoSnapshot.coverageThrough,
      fetchedAt: ukmtoSnapshot.retrievedAt,
      checkedAt: ukmtoSnapshot.checkedAt,
      coverage: "warnings.ukmtoCoverage",
      count: features.length,
      unmappedCount: unmappedReports.length,
      message: "warnings.ukmtoSnapshot",
      attribution: UKMTO_ATTRIBUTION,
      licenseUrl: ukmtoSnapshot.licenseUrl,
    },
  };
}

async function loadBatches(): Promise<SourceBatch[]> {
  if (cached && cached.expiresAt > Date.now()) return cached.batches;
  if (pending) return pending;
  pending = Promise.all([
    ...NAV_AREAS.map(loadNgaArea),
    loadMarad(),
    Promise.resolve(loadUkmtoSnapshot()),
  ])
    .then((batches) => {
      cached = {
        expiresAt: (Math.floor(Date.now() / CACHE_MS) + 1) * CACHE_MS,
        batches,
      };
      return batches;
    })
    .finally(() => {
      pending = undefined;
    });
  return pending;
}

function parseBounds(value: string | null): WarningBounds | null {
  if (value === null) return [-180, -90, 180, 90];
  const values = value.split(",").map(Number);
  if (values.length !== 4 || values.some((number) => !Number.isFinite(number)))
    return null;
  const [west, south, east, north] = values;
  if (
    Math.abs(west) > 180 ||
    Math.abs(east) > 180 ||
    south < -90 ||
    north > 90 ||
    south >= north ||
    west === east
  )
    return null;
  return [west, south, east, north];
}

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const bounds = parseBounds(params.get("bbox"));
  const days = Number(params.get("days") ?? "30");
  const kind = params.get("type") ?? "all";
  if (
    !bounds ||
    ![7, 30, 90, 365].includes(days) ||
    (kind !== "all" && !KINDS.includes(kind as WarningKind))
  ) {
    return Response.json(
      { error: "Invalid bbox, days or warning type." },
      { status: 400 },
    );
  }
  const batches = await loadBatches();
  const cutoff = Date.now() - days * 86_400_000;
  const unique = new Map<string, MaritimeWarningFeature>();
  for (const batch of batches)
    for (const feature of batch.features) {
      const props = feature.properties;
      if (kind !== "all" && props.kind !== kind) continue;
      // Active warnings remain visible regardless of when first issued. Non-current events
      // obey the period selector; regional advisory context uses its declared validity dates.
      const date = props.occurredAt || props.reportedAt || props.validFrom;
      if (!props.active && !props.regional && date && Date.parse(date) < cutoff)
        continue;
      if (warningIntersectsBounds(feature, bounds))
        unique.set(feature.id, feature);
    }
  const matching = [...unique.values()].sort(
    (a, b) =>
      Number(b.properties.active) - Number(a.properties.active) ||
      Date.parse(b.properties.validFrom || "1970-01-01") -
        Date.parse(a.properties.validFrom || "1970-01-01"),
  );
  const features = matching.slice(0, MAX_FEATURES);
  const sources = batches.map((batch) => batch.source);
  const live = sources.some((source) => source.status === "live");
  const unmappedReports = batches
    .flatMap((batch) => batch.unmappedReports ?? [])
    .filter(
      (report) =>
        (kind === "all" || report.kind === kind) &&
        Date.parse(report.occurredAt || report.reportedAt) >= cutoff,
    );
  const updated = sources
    .map((source) => source.updatedAt)
    .filter((date): date is string => date !== null)
    .sort();
  const fetched = sources
    .map((source) => source.fetchedAt)
    .filter((date): date is string => typeof date === "string")
    .sort();
  const checked = sources
    .map((source) => source.checkedAt)
    .filter((date): date is string => typeof date === "string")
    .sort();
  const result: MaritimeWarningCollection = {
    type: "FeatureCollection",
    features,
    metadata: {
      source: "NGA SMAPS; US MARAD; UKMTO",
      sourceUrl: NGA_PAGE,
      coverage: "warnings.coverage",
      updatedAt: updated.at(-1) ?? null,
      fetchedAt: fetched.at(-1) ?? null,
      checkedAt: checked.at(-1) ?? null,
      requestedAt: new Date().toISOString(),
      complete: false,
      status: live ? "partial" : "unavailable",
      message: live ? "warnings.partial" : "warnings.unavailable",
      count: features.length,
      activeCount: features.filter((feature) => feature.properties.active)
        .length,
      unmappedCount: sources.reduce(
        (count, source) => count + source.unmappedCount,
        0,
      ),
      truncated: matching.length > MAX_FEATURES,
      sources,
      unmappedReports,
      disclaimer: NGA_DISCLAIMER,
    },
  };
  return Response.json(result, {
    headers: {
      "Cache-Control": `public, max-age=0, s-maxage=${Math.max(1, Math.floor(((Math.floor(Date.now() / CACHE_MS) + 1) * CACHE_MS - Date.now()) / 1000))}`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

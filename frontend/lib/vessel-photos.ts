export interface VesselPhotoData {
  url: string;
  sourceUrl: string;
  author: string;
  license: string;
  licenseUrl: string | null;
}

type JsonFetcher = (url: string, signal: AbortSignal) => Promise<any>;
const USER_AGENT =
  "AISVesselTracker/1.0 (https://github.com/Snaporaz6/ais-vessel-tracker)";

function apiUrl(host: string, params: Record<string, string>) {
  return `https://${host}/w/api.php?${new URLSearchParams({
    format: "json",
    formatversion: "2",
    ...params,
  })}`;
}

async function fetchJson(url: string, signal: AbortSignal) {
  const options: RequestInit & { next: { revalidate: number } } = {
    headers: { "User-Agent": USER_AGENT },
    signal,
    next: { revalidate: 86400 },
  };
  const response = await fetch(url, options);
  if (!response.ok) throw new Error("Photo source unavailable");
  const data = await response.json();
  if (data.error) throw new Error("Photo source error");
  return data;
}

function claimValues(entity: any, property: string): string[] {
  return (entity.claims?.[property] ?? [])
    .filter((claim: any) => claim.rank !== "deprecated")
    .map((claim: any) => claim.mainsnak?.datavalue?.value)
    .filter((value: unknown) => typeof value === "string");
}

// Metadata from Commons contains markup. Render attribution as plain React text.
function plainText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/<[^>]*>/g, "")
    .replace(
      /&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi,
      (_, entity: string) => {
        const named: Record<string, string> = {
          amp: "&",
          quot: '"',
          apos: "'",
          lt: "<",
          gt: ">",
          nbsp: " ",
        };
        if (entity[0] !== "#") return named[entity.toLowerCase()] ?? "";
        const n =
          entity[1].toLowerCase() === "x"
            ? parseInt(entity.slice(2), 16)
            : parseInt(entity.slice(1), 10);
        return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
      },
    )
    .replace(/\s+/g, " ")
    .trim();
}

function safeUrl(value: unknown, hosts: string[]): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      hosts.includes(url.hostname)
      ? url.href
      : null;
  } catch {
    return null;
  }
}

async function categoryFiles(
  category: string,
  read: JsonFetcher,
  signal: AbortSignal,
): Promise<string[]> {
  const resolved = await read(
    apiUrl("commons.wikimedia.org", {
      action: "query",
      titles: category,
      redirects: "1",
      prop: "categoryinfo",
    }),
    signal,
  );
  const page = resolved.query?.pages?.find(
    (p: any) => !p.missing && p.ns === 14,
  );
  if (!page) return [];
  const members = await read(
    apiUrl("commons.wikimedia.org", {
      action: "query",
      list: "categorymembers",
      cmtitle: page.title,
      cmnamespace: "6",
      cmlimit: "3",
      cmtype: "file",
    }),
    signal,
  );
  return (members.query?.categorymembers ?? []).map((p: any) => p.title);
}

/** Resolve by exact IMO/MMSI; never infer a ship's identity from its name. */
export async function resolveVesselPhoto(
  identity: { mmsi: string; imo: string | null },
  signal: AbortSignal,
  read: JsonFetcher = fetchJson,
): Promise<VesselPhotoData | null> {
  const { mmsi, imo } = identity;
  const property = imo ? "P458" : "P587";
  const identifier = imo ?? mmsi;
  const search = await read(
    apiUrl("www.wikidata.org", {
      action: "query",
      list: "search",
      srnamespace: "0",
      srlimit: "5",
      srsearch: `haswbstatement:${property}=${identifier}`,
    }),
    signal,
  );
  const ids = (search.query?.search ?? [])
    .map((result: any) => result.title)
    .filter((id: unknown) => typeof id === "string" && /^Q\d+$/.test(id));
  let files: string[] = [];
  let category: string | null = null;
  if (ids.length) {
    const data = await read(
      apiUrl("www.wikidata.org", {
        action: "wbgetentities",
        ids: ids.join("|"),
        props: "claims|sitelinks",
        sitefilter: "commonswiki",
      }),
      signal,
    );
    const entities = Object.values(data.entities ?? {}).filter((entity: any) =>
      claimValues(entity, property).includes(identifier),
    ) as any[];
    // Multiple ships with the same identifier are ambiguous; show no photograph.
    if (entities.length > 1) return null;
    if (entities.length === 1) {
      files = claimValues(entities[0], "P18")
        .slice(0, 3)
        .map((name) => `File:${name}`);
      const title = entities[0].sitelinks?.commonswiki?.title;
      if (typeof title === "string" && title.startsWith("Category:"))
        category = title;
    }
  }
  if (!files.length && (category || imo)) {
    files = await categoryFiles(
      category ?? `Category:IMO ${imo}`,
      read,
      signal,
    );
  }
  if (!files.length) return null;
  const data = await read(
    apiUrl("commons.wikimedia.org", {
      action: "query",
      titles: files.join("|"),
      prop: "imageinfo",
      iiprop: "url|mime|extmetadata",
      iiurlwidth: "640",
      iiextmetadatafilter: "Artist|Attribution|LicenseShortName|LicenseUrl",
    }),
    signal,
  );
  for (const page of data.query?.pages ?? []) {
    const info = page.imageinfo?.[0];
    if (!info || !["image/jpeg", "image/png", "image/webp"].includes(info.mime))
      continue;
    const url = safeUrl(info.thumburl ?? info.url, [
      "upload.wikimedia.org",
      "thumb.wikimedia.org",
    ]);
    const sourceUrl = safeUrl(info.descriptionurl, ["commons.wikimedia.org"]);
    const metadata = info.extmetadata ?? {};
    const author = plainText(
      metadata.Attribution?.value || metadata.Artist?.value,
    );
    const license = plainText(metadata.LicenseShortName?.value);
    if (!url || !sourceUrl || !author || !license) continue;
    return {
      url,
      sourceUrl,
      author,
      license,
      licenseUrl: safeUrl(metadata.LicenseUrl?.value, [
        "creativecommons.org",
        "www.gnu.org",
        "gnu.org",
      ]),
    };
  }
  return null;
}

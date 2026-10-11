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
    signal: AbortSignal.any([signal, AbortSignal.timeout(3000)]),
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
      cmlimit: "12",
      cmtype: "file",
    }),
    signal,
  );
  const files = (members.query?.categorymembers ?? []).map((p: any) => p.title);
  if (files.length) return files;
  // Ship categories frequently contain only subcategories by year or location.
  // Stay inside the identified ship's category and cap traversal at one level.
  const children = await read(
    apiUrl("commons.wikimedia.org", {
      action: "query",
      list: "categorymembers",
      cmtitle: page.title,
      cmnamespace: "14",
      cmlimit: "3",
      cmtype: "subcat",
    }),
    signal,
  );
  const results = await Promise.all(
    (children.query?.categorymembers ?? []).map(async (child: any) => {
      const data = await read(
        apiUrl("commons.wikimedia.org", {
          action: "query",
          list: "categorymembers",
          cmtitle: child.title,
          cmnamespace: "6",
          cmlimit: "4",
          cmtype: "file",
        }),
        signal,
      );
      return (data.query?.categorymembers ?? []).map((p: any) => p.title);
    }),
  );
  return results.flat();
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
  let entity: any = null;
  let failure: unknown = null;
  try {
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
    if (ids.length) {
      const data = await read(
        apiUrl("www.wikidata.org", {
          action: "wbgetentities",
          ids: ids.join("|"),
          props: "claims|sitelinks",
          sitefilter: "commonswiki|enwiki|itwiki",
        }),
        signal,
      );
      const entities = Object.entries(data.entities ?? {}).filter(
        ([, item]: any) => claimValues(item, property).includes(identifier),
      );
      if (entities.length > 1) return null;
      if (entities.length === 1)
        entity = { ...(entities[0][1] as any), id: entities[0][0] };
    }
  } catch (error) {
    failure = error;
  }

  const files = entity
    ? claimValues(entity, "P18")
        .slice(0, 3)
        .map((name) => `File:${name}`)
    : [];
  if (files.length) {
    try {
      const photo = await photoFromFiles(files, read, signal);
      if (photo) return photo;
    } catch (error) {
      failure = error;
    }
  }

  const linked = entity?.sitelinks?.commonswiki?.title;
  const category =
    typeof linked === "string" && linked.startsWith("Category:")
      ? linked
      : entity && claimValues(entity, "P373")[0]
        ? `Category:${claimValues(entity, "P373")[0]}`
        : imo
          ? `Category:IMO ${imo}`
          : null;
  if (category) {
    try {
      const candidates = await categoryFiles(category, read, signal);
      if (candidates.length) {
        const photo = await photoFromFiles(candidates, read, signal);
        if (photo) return photo;
      }
    } catch (error) {
      failure = error;
    }
  }

  if (entity) {
    // Independent discovery paths: structured Commons depicts statements and
    // Wikipedia's lead image, both attached to the exact validated Wikidata ID.
    const results = await Promise.allSettled([
      (async () => {
        const search = await read(
          apiUrl("commons.wikimedia.org", {
            action: "query",
            list: "search",
            srnamespace: "6",
            srlimit: "6",
            srsearch: `haswbstatement:P180=${entity.id} filetype:bitmap`,
          }),
          signal,
        );
        return (search.query?.search ?? [])
          .map((p: any) => p.title)
          .filter(
            (title: unknown) =>
              typeof title === "string" && title.startsWith("File:"),
          );
      })(),
      wikipediaFiles(entity, read, signal),
    ]);
    const candidates: string[] = [];
    for (const result of results) {
      if (result.status === "fulfilled") candidates.push(...result.value);
      else failure = result.reason;
    }
    if (candidates.length) {
      try {
        const photo = await photoFromFiles(
          [...new Set(candidates)],
          read,
          signal,
        );
        if (photo) return photo;
      } catch (error) {
        failure = error;
      }
    }
  }
  if (failure) throw failure;
  return null;
}

async function wikipediaFiles(
  entity: any,
  read: JsonFetcher,
  signal: AbortSignal,
): Promise<string[]> {
  const site = entity.sitelinks?.enwiki?.title ? "enwiki" : "itwiki";
  const title = entity.sitelinks?.[site]?.title;
  if (!title) return [];
  const data = await read(
    apiUrl(site === "enwiki" ? "en.wikipedia.org" : "it.wikipedia.org", {
      action: "query",
      titles: title,
      redirects: "1",
      prop: "pageimages|pageprops",
      piprop: "name",
      pilicense: "free",
      ppprop: "wikibase_item",
    }),
    signal,
  );
  return (data.query?.pages ?? [])
    .filter(
      (p: any) =>
        p.pageprops?.wikibase_item === entity.id &&
        typeof p.pageimage === "string",
    )
    .map((p: any) => `File:${p.pageimage}`);
  // All files are subsequently resolved on Commons; Wikipedia-only/nonfree
  // images cannot pass photoFromFiles' host, attribution and license checks.
}

async function photoFromFiles(
  files: string[],
  read: JsonFetcher,
  signal: AbortSignal,
): Promise<VesselPhotoData | null> {
  const data = await read(
    apiUrl("commons.wikimedia.org", {
      action: "query",
      titles: files.join("|"),
      prop: "imageinfo",
      iiprop: "url|mime|extmetadata",
      iiurlwidth: "640",
      iiextmetadatafilter:
        "Artist|Attribution|LicenseShortName|LicenseUrl|Copyrighted|Restrictions",
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
    // Restrict automatic reuse to explicit free licenses suitable for a future
    // commercial service. Unknown/NC/ND/custom permissions remain excluded.
    const reusable =
      /^(?:CC0(?: 1\.0)?|Public domain|CC BY(?:-SA)? (?:1\.0|2\.0|2\.5|3\.0|4\.0))$/i.test(
        license,
      );
    if (!url || !sourceUrl || !author || !license || !reusable) continue;
    if (plainText(metadata.Restrictions?.value)) continue;
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

import { XMLParser, XMLValidator } from "fast-xml-parser";
import { load } from "cheerio";
import type { Repository, Source, ImportState } from "../storage/repository.js";
import type { SanctionRecord } from "../shared/types.js";
const OFAC_URL =
  "https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.XML";
const EU_URL =
  "https://eur-lex.europa.eu/legal-content/EN/ALL/?uri=CELEX:32014R0833";
const IMO = /\bIMO[:\s#]*(\d{7})\b/i,
  MMSI = /\bMMSI[:\s#]*(\d{9})\b/i;
export function resolveEUConsolidatedURL(html: string, at: string): string {
  const $ = load(html),
    dates: string[] = [];
  $("a[href]").each((_, anchor) => {
    let url: URL;
    try {
      url = new URL($(anchor).attr("href")!, EU_URL);
    } catch {
      return;
    }
    if (url.protocol !== "https:" || url.hostname !== "eur-lex.europa.eu")
      return;
    const match = url.searchParams
      .get("uri")
      ?.match(/^CELEX:02014R0833-(\d{8})$/i);
    if (!match) return;
    const date = match[1],
      iso = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
    const parsed = new Date(`${iso}T00:00:00Z`);
    if (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === iso &&
      iso <= at.slice(0, 10)
    )
      dates.push(date);
  });
  const latest = dates.sort().at(-1);
  if (!latest) throw new Error("EU_CONSOLIDATION_NOT_FOUND");
  return `https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:02014R0833-${latest}`;
}
async function downloadSanctions(
  url: string,
  source: Source,
  fetcher: typeof fetch,
): Promise<string> {
  if (
    new URL(url).protocol !== "https:" ||
    !["eur-lex.europa.eu", "sanctionslistservice.ofac.treas.gov"].includes(
      new URL(url).hostname,
    )
  )
    throw new Error("INVALID_SANCTIONS_SOURCE");
  const res = await fetcher(url, {
    signal: AbortSignal.timeout(60_000),
    headers: {
      "User-Agent": "AIS-Vessel-Tracker/0.2 (personal research)",
      Accept: source === "OFAC" ? "application/xml" : "text/html",
    },
  });
  if (!res.ok || res.status === 202)
    throw new Error("SANCTIONS_DOWNLOAD_FAILED");
  const text = await res.text();
  if (!text.length || text.length > 64 * 1024 * 1024)
    throw new Error("SANCTIONS_DOWNLOAD_INVALID");
  return text;
}
export function parseOFAC(xml: string, at: string): SanctionRecord[] {
  if (XMLValidator.validate(xml) !== true) throw new Error("INVALID_OFAC_XML");
  const data = new XMLParser({
    ignoreAttributes: true,
    isArray: (name) => ["sdnEntry", "id", "program"].includes(name),
  }).parse(xml);
  if (!Array.isArray(data?.sdnList?.sdnEntry))
    throw new Error("INVALID_OFAC_SCHEMA");
  return data.sdnList.sdnEntry
    .filter((e: any) => e.sdnType === "Vessel")
    .map((e: any) => {
      let imo: string | null = null,
        mmsi: string | null = null;
      for (const id of e.idList?.id ?? []) {
        const type = String(id.idType ?? "").toUpperCase(),
          text = String(id.idNumber ?? "");
        if (type.includes("IMO") || type.includes("VESSEL REGISTRATION"))
          imo = text.match(IMO)?.[1] ?? (/^\d{7}$/.test(text) ? text : imo);
        if (type.includes("MMSI"))
          mmsi =
            text.match(MMSI)?.[1] ?? (/^[1-9]\d{8}$/.test(text) ? text : mmsi);
      }
      const remarks = String(e.remarksText ?? "");
      imo ??= remarks.match(IMO)?.[1] ?? null;
      mmsi ??= remarks.match(MMSI)?.[1] ?? null;
      return {
        imo,
        mmsi,
        name: [e.lastName, e.firstName].filter(Boolean).join(" ").trim(),
        source: "OFAC",
        listed_at: at,
        details_json: {
          uid: e.uid,
          programs: e.programList?.program ?? [],
          source_url: OFAC_URL,
          scope: "OFAC SDN — navi",
        },
      };
    });
}
export function parseEU(html: string, at: string): SanctionRecord[] {
  const $ = load(html);
  let table: ReturnType<typeof $> | null = null;
  // Find the actual Annex XLII table by its headers. Do not collect unrelated
  // IMO numbers from the rest of the Regulation or use the financial list as a proxy.
  $("table").each((_, element) => {
    const text = $(element).text().replace(/\s+/g, " ");
    if (
      /Vessel name/i.test(text) &&
      /IMO number/i.test(text) &&
      /Grounds for inclusion/i.test(text) &&
      /Date of application/i.test(text)
    )
      table = $(element);
  });
  if (!table) throw new Error("INVALID_EU_SCHEMA");
  const records: SanctionRecord[] = [],
    seen = new Set<string>();
  (table as ReturnType<typeof $>).find("tr").each((_, row) => {
    const cells = $(row)
      .children("td")
      .map((_, cell) => $(cell).text().replace(/\s+/g, " ").trim())
      .get();
    const idx = cells.findIndex((s) => /^\d{7}$/.test(s));
    if (idx < 1) return;
    const imo = cells[idx];
    if (seen.has(imo)) return;
    seen.add(imo);
    const rawDate = cells.at(-1)!,
      parts = rawDate.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    const date = parts
      ? new Date(
          Date.UTC(Number(parts[3]), Number(parts[2]) - 1, Number(parts[1])),
        ).toISOString()
      : at;
    records.push({
      mmsi: null,
      imo,
      name: cells[idx - 1],
      source: "EU",
      listed_at: date,
      details_json: {
        grounds: cells[idx + 1],
        source_url: EU_URL,
        scope: "UE — Regolamento 833/2014, Annex XLII, divieti porti e servizi",
      },
    });
  });
  if (records.length < 100) throw new Error("INCOMPLETE_EU_IMPORT");
  return records;
}
export async function syncSanctions(
  repo: Repository,
  fetcher: typeof fetch = fetch,
  options: { onlyDue?: boolean } = {},
) {
  const states = options.onlyDue
    ? await repo.all<ImportState>("import_states")
    : [];
  const results = await Promise.allSettled(
    (["OFAC", "EU"] as Source[]).map(async (source) => {
      const at = new Date().toISOString();
      if (
        states.some(
          (s) =>
            s.source === source &&
            !s.last_error &&
            s.updated_at?.slice(0, 10) === at.slice(0, 10),
        )
      )
        return;
      try {
        let url =
          source === "OFAC" ? OFAC_URL : process.env.EU_SANCTIONS_URL || EU_URL;
        if (source === "EU" && !process.env.EU_SANCTIONS_URL) {
          const index = await downloadSanctions(EU_URL, source, fetcher);
          url = resolveEUConsolidatedURL(index, at);
        }
        const text = await downloadSanctions(url, source, fetcher);
        const rows =
          source === "OFAC" ? parseOFAC(text, at) : parseEU(text, at);
        for (const row of rows)
          row.details_json = { ...row.details_json, source_url: url };
        if (source === "OFAC" && rows.length < 100)
          throw new Error("INCOMPLETE_OFAC_IMPORT");
        await repo.replaceSanctions(source, rows, at);
        console.info(
          JSON.stringify({
            event: "sanctions_import_ok",
            source,
            count: rows.length,
          }),
        );
      } catch {
        await repo.importFailure(source, at);
        console.warn(
          JSON.stringify({ event: "sanctions_import_failed", source }),
        );
        throw new Error("SANCTIONS_IMPORT_FAILED");
      }
    }),
  );
  if (results.some((r) => r.status === "rejected"))
    throw new Error("SANCTIONS_IMPORT_PARTIAL");
}
if (require.main === module)
  import("../storage/repository.js")
    .then(async ({ PostgresRepository }) => {
      const { config } = await import("dotenv");
      config({ path: process.env.ENV_FILE ?? ".env.local" });
      const url = process.env.SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!url || !key) throw new Error("DATABASE_SETTINGS_REQUIRED");
      const repo = new PostgresRepository(url, key);
      await repo.health();
      try {
        await syncSanctions(repo, fetch, {
          onlyDue: !process.argv.includes("--force"),
        });
      } finally {
        if (process.env.REPORT_FILE) {
          const { writeFileSync } = await import("node:fs");
          writeFileSync(
            process.env.REPORT_FILE,
            JSON.stringify(
              {
                at: new Date().toISOString(),
                imports: await repo.all("import_states"),
              },
              null,
              2,
            ),
          );
        }
      }
    })
    .catch(() => {
      console.error(
        "Sincronizzazione non riuscita: lista precedente conservata.",
      );
      process.exitCode = 1;
    });

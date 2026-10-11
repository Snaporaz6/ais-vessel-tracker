import { apiURL } from "../../../lib/api";
import { getCatalogPort } from "../../../lib/marine-data";
import type { PortTraffic } from "../../../../shared/types";
export const runtime = "nodejs";
export const maxDuration = 20;
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!/^\d{1,6}$/.test(id))
    return Response.json({ error: "Invalid port ID" }, { status: 400 });
  const port = await getCatalogPort(id);
  if (!port)
    return Response.json({ error: "Unknown NGA port" }, { status: 404 });
  try {
    const response = await fetch(apiURL(`/api/port-traffic/${id}`), {
      cache: "no-store",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(15_000)]),
    });
    if (!response.ok) throw new Error("Port traffic unavailable");
    const data = (await response.json()) as PortTraffic;
    const ttl = Math.max(
      1,
      Math.min(
        60,
        Math.floor(
          (Date.parse(data.generated_at) + 60_000 - Date.now()) / 1000,
        ),
      ),
    );
    return Response.json(
      { ...data, details: port.properties },
      { headers: { "Cache-Control": `public, max-age=0, s-maxage=${ttl}` } },
    );
  } catch {
    return Response.json(
      {
        error: "Traffico portuale temporaneamente non disponibile.",
        details: port.properties,
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

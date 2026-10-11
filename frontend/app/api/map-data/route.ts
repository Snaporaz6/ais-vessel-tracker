import {
  getMarineData,
  isMarineLayer,
  parseMarineBbox,
} from "../../../lib/marine-data";

export const runtime = "nodejs";
export const maxDuration = 25;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const layer = params.get("layer") ?? "";
  const bbox = parseMarineBbox(params.get("bbox") ?? "");
  const zoomText = params.get("zoom") ?? "";
  const zoom = zoomText.trim() ? Number(zoomText) : NaN;
  if (
    !isMarineLayer(layer) ||
    !bbox ||
    !Number.isFinite(zoom) ||
    zoom < 0 ||
    zoom > 22
  ) {
    return Response.json(
      { error: "Invalid map layer, bbox or zoom" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  const data = await getMarineData(layer, bbox, zoom);
  const failure = data.metadata.status === "error";
  const partial = data.metadata.status === "partial";
  return Response.json(data, {
    status: failure ? 503 : 200,
    headers: {
      "Cache-Control":
        failure || partial
          ? "no-store"
          : "public, max-age=300, s-maxage=1800, stale-while-revalidate=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

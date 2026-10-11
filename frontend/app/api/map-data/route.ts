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
  const secondsToDayEnd = Math.max(
    1,
    Math.floor(
      ((Math.floor(Date.now() / 86400000) + 1) * 86400000 - Date.now()) / 1000,
    ),
  );
  return Response.json(data, {
    status: failure ? 503 : 200,
    headers: {
      "Cache-Control": failure
        ? "no-store"
        : partial
          ? "public, max-age=900, s-maxage=900"
          : `public, max-age=${secondsToDayEnd}, s-maxage=${secondsToDayEnd}`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

import { resolveVesselPhoto } from "../../../lib/vessel-photos";

export const runtime = "nodejs";
export const maxDuration = 15;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const mmsi = params.get("mmsi") ?? "";
  const imo = params.get("imo") || null;
  if (
    !/^[1-9]\d{8}$/.test(mmsi) ||
    (imo !== null && !/^[1-9]\d{6}$/.test(imo))
  ) {
    return Response.json(
      { error: "Identificativo nave non valido." },
      { status: 400 },
    );
  }
  try {
    const photo = await resolveVesselPhoto(
      { mmsi, imo },
      AbortSignal.timeout(8000),
    );
    return Response.json(
      { photo },
      {
        headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" },
      },
    );
  } catch {
    return Response.json(
      { error: "Fonte fotografica temporaneamente non disponibile." },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}

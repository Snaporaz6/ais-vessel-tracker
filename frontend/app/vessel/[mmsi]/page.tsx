import Link from "next/link";
import { getVessel, getPortCalls } from "../../../lib/api";
import VesselView from "../../../components/VesselView";
export default async function VesselPage({
  params,
}: {
  params: Promise<{ mmsi: string }>;
}) {
  const { mmsi } = await params;
  if (!/^[1-9]\d{8}$/.test(mmsi))
    return (
      <main className="detail-page">
        <Link href="/">← Mappa</Link>
        <p>MMSI non valido.</p>
      </main>
    );
  const [v, s] = await Promise.allSettled([
    getVessel(mmsi),
    getPortCalls(mmsi),
  ]);
  return (
    <main className="detail-page">
      <Link href="/">← Mappa del Mediterraneo</Link>
      {v.status === "fulfilled" ? (
        <VesselView
          vessel={v.value}
          stops={s.status === "fulfilled" ? s.value : []}
          stopsError={
            s.status === "rejected"
              ? "Soste temporaneamente non disponibili."
              : undefined
          }
        />
      ) : (
        <div className="notice" role="alert">
          {v.reason instanceof Error
            ? v.reason.message
            : "Scheda temporaneamente non disponibile."}
        </div>
      )}
    </main>
  );
}

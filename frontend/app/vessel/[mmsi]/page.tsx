import { BackToMap, PageError } from "../../../components/LocalizedPage";
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
        <BackToMap short />
        <PageError message="MMSI non valido." />
      </main>
    );
  const [v, s] = await Promise.allSettled([
    getVessel(mmsi),
    getPortCalls(mmsi),
  ]);
  return (
    <main className="detail-page">
      <BackToMap />
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
        <PageError
          message={
            v.reason instanceof Error
              ? v.reason.message
              : "Scheda temporaneamente non disponibile."
          }
        />
      )}
    </main>
  );
}

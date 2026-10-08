import Link from "next/link";
import { getPort } from "../../../lib/api";
import { date, duration, shipNames } from "../../../lib/format";
export default async function PortPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
  const data = await getPort(name).catch(() => null);
  return (
    <main className="detail-page">
      <Link href="/">← Mappa del Mediterraneo</Link>
      <p className="eyebrow">Località osservata</p>
      <h1>Soste rilevate</h1>
      <p className="muted">{name} · Le coordinate non identificano un porto.</p>
      {data ? (
        <>
          <p className="muted">
            Riepilogo delle{" "}
            {data.results_limited ? "ultime 50" : data.total_visits} soste
            disponibili, entro 500 metri e negli ultimi 90 giorni.
            {data.results_limited &&
              " Sono presenti altre soste: i conteggi e la media si riferiscono alle ultime 50."}
          </p>
          <dl className="data-grid">
            <div>
              <dt>Navi osservate</dt>
              <dd>{data.total_vessels_seen}</dd>
            </div>
            <div>
              <dt>Soste registrate</dt>
              <dd>{data.total_visits}</dd>
            </div>
            <div>
              <dt>Soste in corso</dt>
              <dd>{data.currently_in_port}</dd>
            </div>
            <div>
              <dt>Durata media osservata</dt>
              <dd>{duration(data.avg_stay_hours)}</dd>
            </div>
          </dl>
          <section>
            <h2>Ultime soste · fino a 90 giorni</h2>
            {data.recent_visits.length ? (
              data.recent_visits.map((v, i) => (
                <div
                  className="list-row"
                  key={`${v.mmsi}:${v.arrived_at}:${i}`}
                >
                  <Link href={`/vessel/${v.mmsi}`}>{v.vessel_name}</Link>
                  <p>
                    {shipNames[v.ship_type]} · {duration(v.duration_hours)}
                  </p>
                  <p className="small muted">
                    {date(v.arrived_at)} ·{" "}
                    {v.departed_at
                      ? date(v.departed_at)
                      : "In corso nelle ultime osservazioni"}
                  </p>
                </div>
              ))
            ) : (
              <p>Nessuna sosta rilevata.</p>
            )}
          </section>
        </>
      ) : (
        <p role="alert" className="notice">
          Il servizio soste non è disponibile. Riprovare più tardi.
        </p>
      )}
    </main>
  );
}

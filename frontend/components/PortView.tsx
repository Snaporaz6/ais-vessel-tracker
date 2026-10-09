"use client";
import Link from "next/link";
import type { PortInfo } from "../../shared/types";
import { useLanguage } from "./LanguageProvider";
import { BackToMap } from "./LocalizedPage";
export default function PortView({
  name,
  data,
}: {
  name: string;
  data: PortInfo | null;
}) {
  const { t, date, duration, shipNames, numbers } = useLanguage();
  return (
    <main className="detail-page">
      <BackToMap />
      <p className="eyebrow">{t("Località osservata")}</p>
      <h1>{t("Soste rilevate")}</h1>
      <p className="muted">
        {name} · {t("Le coordinate non identificano un porto.")}
      </p>
      {data ? (
        <>
          <p className="muted">
            {t(
              "Riepilogo delle {count} soste disponibili, entro 500 metri e negli ultimi 90 giorni.",
              {
                count: data.results_limited
                  ? t("ultime 50")
                  : numbers(data.total_visits),
              },
            )}
            {data.results_limited && (
              <>
                {" "}
                {t(
                  "Sono presenti altre soste: i conteggi e la media si riferiscono alle ultime 50.",
                )}
              </>
            )}
          </p>
          <dl className="data-grid">
            <div>
              <dt>{t("Navi osservate")}</dt>
              <dd>{numbers(data.total_vessels_seen)}</dd>
            </div>
            <div>
              <dt>{t("Soste registrate")}</dt>
              <dd>{numbers(data.total_visits)}</dd>
            </div>
            <div>
              <dt>{t("Soste in corso")}</dt>
              <dd>{numbers(data.currently_in_port)}</dd>
            </div>
            <div>
              <dt>{t("Durata media osservata")}</dt>
              <dd>{duration(data.avg_stay_hours)}</dd>
            </div>
          </dl>
          <section>
            <h2>{t("Ultime soste · fino a 90 giorni")}</h2>
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
                      : t("In corso nelle ultime osservazioni")}
                  </p>
                </div>
              ))
            ) : (
              <p>{t("Nessuna sosta rilevata.")}</p>
            )}
          </section>
        </>
      ) : (
        <p role="alert" className="notice">
          {t("Il servizio soste non è disponibile. Riprovare più tardi.")}
        </p>
      )}
    </main>
  );
}

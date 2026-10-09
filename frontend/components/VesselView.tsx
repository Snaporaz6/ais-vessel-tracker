"use client";
import { useLanguage } from "./LanguageProvider";
import type { VesselDetail, PortCall } from "../../shared/types";
import AnomalyBadge from "./AnomalyBadge";
import SanctionBadge from "./SanctionBadge";
import VesselPhoto from "./VesselPhoto";
export default function VesselView({
  vessel: v,
  stops,
  onShowTrack,
  stopsError,
}: {
  vessel: VesselDetail;
  stops: PortCall[];
  onShowTrack?: () => void;
  stopsError?: string;
}) {
  const { t, date, value, duration, shipNames, errorText } = useLanguage();
  const p = v.last_position,
    check = v.sanctions_check;
  return (
    <>
      <VesselPhoto
        key={v.mmsi}
        mmsi={v.mmsi}
        imo={v.imo}
        vesselName={v.name}
        height={180}
      />
      <p className="eyebrow">
        {shipNames[v.ship_type]} · {v.flag || t("Bandiera non disponibile")}
      </p>
      <h1>{v.name}</h1>
      <p className="muted">
        MMSI {v.mmsi} · IMO {v.imo ?? t("non disponibile")}
      </p>
      {v.data_status === "partial" && (
        <p className="notice" role="alert">
          {t(
            "Il servizio anomalie non è disponibile. I dati della nave sono parziali.",
          )}
        </p>
      )}
      <section>
        <h2>{t("Ultima osservazione")}</h2>
        {p ? (
          <>
            <p className="timestamp">{date(p.timestamp)}</p>
            <dl className="data-grid">
              <div>
                <dt>{t("Coordinate")}</dt>
                <dd>
                  {p.lat.toFixed(4)}, {p.lon.toFixed(4)}
                </dd>
              </div>
              <div>
                <dt>{t("Velocità")}</dt>
                <dd>{value(p.speed, " kn")}</dd>
              </div>
              <div>
                <dt>{t("Rotta")}</dt>
                <dd>{value(p.course, "°")}</dd>
              </div>
              <div>
                <dt>{t("Dimensioni")}</dt>
                <dd>
                  {v.length ?? "?"} × {v.width ?? "?"} m
                </dd>
              </div>
            </dl>
          </>
        ) : (
          <p className="muted">{t("Posizione non disponibile.")}</p>
        )}
      </section>
      <section>
        <h2>{t("Informazioni trasmesse dalla nave")}</h2>
        <dl>
          <dt>{t("Destinazione dichiarata")}</dt>
          <dd>{v.destination || t("Non disponibile")}</dd>
          <dt>{t("ETA dichiarata")}</dt>
          <dd>{date(v.eta)}</dd>
        </dl>
        <p className="muted small">
          {t(
            "Destinazione ed ETA sono messaggi AIS: possono essere incompleti o non aggiornati.",
          )}
        </p>
      </section>
      <div className="actions">
        {onShowTrack ? (
          <button onClick={onShowTrack}>{t("Mostra traccia")}</button>
        ) : (
          <a className="button" href={`/?vessel=${v.mmsi}&track=${v.mmsi}`}>
            {t("Mostra sulla mappa")}
          </a>
        )}
        <a className="button" href={`/vessel/${v.mmsi}`}>
          {t("Scheda completa")}
        </a>
      </div>
      <section>
        <h2>{t("Controllo sanzioni")}</h2>
        {v.sanctions.map((s, i) => (
          <div key={i}>
            <SanctionBadge source={s.source} />
            <p className="small">
              {String(s.details_json.scope ?? s.source)} · {date(s.listed_at)}
            </p>
          </div>
        ))}
        <p>
          {check.status === "matched"
            ? t("Corrispondenza con una lista acquisita.")
            : check.status === "no_match"
              ? t("Nessuna corrispondenza nelle liste consultate.")
              : check.status === "stale"
                ? t(
                    "Controllo non aggiornato: nessuna conclusione disponibile.",
                  )
                : t(
                    "Controllo non disponibile: nessuna conclusione disponibile.",
                  )}
        </p>
        <p className="small muted">
          {t("Ultimo controllo: {date}", { date: date(check.checked_at) })}
        </p>
        {check.sources.map((s) => (
          <p className="small muted" key={s.source}>
            {s.source === "EU"
              ? t("UE · Annex XLII del Regolamento 833/2014")
              : t("OFAC · SDN navi")}
            :{" "}
            {s.status === "ok"
              ? t("aggiornata")
              : s.status === "stale"
                ? t("non aggiornata")
                : t("non disponibile")}{" "}
            · {date(s.updated_at)}
          </p>
        ))}
        <p className="small muted">
          {t(
            "Sono consultate le fonti indicate, non tutti i regimi sanzionatori.",
          )}
        </p>
      </section>
      <section>
        <h2>{t("Soste rilevate · ultimi 90 giorni")}</h2>
        <p className="small muted">
          {t(
            "Località ricostruite dalle osservazioni; non sono porti identificati.",
          )}
        </p>
        {stopsError ? (
          <p role="alert" className="notice">
            {errorText(stopsError)}
          </p>
        ) : stops.length ? (
          stops.slice(0, 30).map((s) => (
            <div className="list-row" key={s.id ?? s.arrived_at}>
              <a href={`/port/${encodeURIComponent(s.port_name)}`}>
                {s.port_name}
              </a>
              <p>
                {duration(s.duration_hours)} · {date(s.arrived_at)}
              </p>
              <p className="small muted">
                {s.departed_at
                  ? s.uncertain_departure
                    ? t("Fine osservata; partenza incerta.")
                    : t("Fine: {date}", { date: date(s.departed_at) })
                  : t("Sosta in corso nelle ultime osservazioni.")}
              </p>
            </div>
          ))
        ) : (
          <p className="muted">
            {t("Nessuna sosta rilevata nella finestra disponibile.")}
          </p>
        )}
      </section>
      <section>
        <h2>{t("Segnalazioni da verificare")}</h2>
        <p className="small muted">
          {t(
            "Le anomalie segnalano osservazioni insolite e non provano attività illecite.",
          )}
        </p>
        {v.data_status === "partial" ? (
          <p className="notice">
            {t("Controllo temporaneamente non disponibile.")}
          </p>
        ) : v.anomalies.length ? (
          v.anomalies.map((a, i) => (
            <div className="list-row" key={a.id ?? i}>
              <AnomalyBadge type={a.type} />
              <span className="small">{date(a.detected_at)}</span>
            </div>
          ))
        ) : (
          <p className="muted">{t("Nessuna segnalazione registrata.")}</p>
        )}
      </section>
    </>
  );
}

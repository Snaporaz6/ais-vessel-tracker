import type { VesselDetail, PortCall } from "../../shared/types";
import { date, value, duration, shipNames } from "../lib/format";
import AnomalyBadge from "./AnomalyBadge";
import SanctionBadge from "./SanctionBadge";
import VesselPhoto from "./VesselPhoto";
export default function VesselView({
  vessel: v,
  stops,
  onShowTrack,
  stopsError,
  showPhoto = false,
}: {
  vessel: VesselDetail;
  stops: PortCall[];
  onShowTrack?: () => void;
  stopsError?: string;
  showPhoto?: boolean;
}) {
  const p = v.last_position,
    check = v.sanctions_check;
  return (
    <>
      {showPhoto && (
        <VesselPhoto
          key={v.mmsi}
          mmsi={v.mmsi}
          imo={v.imo}
          vesselName={v.name}
          height={180}
        />
      )}
      <p className="eyebrow">
        {shipNames[v.ship_type]} · {v.flag || "Bandiera non disponibile"}
      </p>
      <h1>{v.name}</h1>
      <p className="muted">
        MMSI {v.mmsi} · IMO {v.imo ?? "non disponibile"}
      </p>
      {v.data_status === "partial" && (
        <p className="notice" role="alert">
          Il servizio anomalie non è disponibile. I dati della nave sono
          parziali.
        </p>
      )}
      <section>
        <h2>Ultima osservazione</h2>
        {p ? (
          <>
            <p className="timestamp">{date(p.timestamp)}</p>
            <dl className="data-grid">
              <div>
                <dt>Coordinate</dt>
                <dd>
                  {p.lat.toFixed(4)}, {p.lon.toFixed(4)}
                </dd>
              </div>
              <div>
                <dt>Velocità</dt>
                <dd>{value(p.speed, " kn")}</dd>
              </div>
              <div>
                <dt>Rotta</dt>
                <dd>{value(p.course, "°")}</dd>
              </div>
              <div>
                <dt>Dimensioni</dt>
                <dd>
                  {v.length ?? "?"} × {v.width ?? "?"} m
                </dd>
              </div>
            </dl>
          </>
        ) : (
          <p className="muted">Posizione non disponibile.</p>
        )}
      </section>
      <section>
        <h2>Informazioni trasmesse dalla nave</h2>
        <dl>
          <dt>Destinazione dichiarata</dt>
          <dd>{v.destination || "Non disponibile"}</dd>
          <dt>ETA dichiarata</dt>
          <dd>{date(v.eta)}</dd>
        </dl>
        <p className="muted small">
          Destinazione ed ETA sono messaggi AIS: possono essere incompleti o non
          aggiornati.
        </p>
      </section>
      <div className="actions">
        {onShowTrack ? (
          <button onClick={onShowTrack}>Mostra traccia</button>
        ) : (
          <a className="button" href={`/?vessel=${v.mmsi}&track=${v.mmsi}`}>
            Mostra sulla mappa
          </a>
        )}
        <a className="button" href={`/vessel/${v.mmsi}`}>
          Scheda completa
        </a>
      </div>
      <section>
        <h2>Controllo sanzioni</h2>
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
            ? "Corrispondenza con una lista acquisita."
            : check.status === "no_match"
              ? "Nessuna corrispondenza nelle liste consultate."
              : check.status === "stale"
                ? "Controllo non aggiornato: nessuna conclusione disponibile."
                : "Controllo non disponibile: nessuna conclusione disponibile."}
        </p>
        <p className="small muted">
          Ultimo controllo: {date(check.checked_at)}
        </p>
        {check.sources.map((s) => (
          <p className="small muted" key={s.source}>
            {s.source === "EU"
              ? "UE · Annex XLII del Regolamento 833/2014"
              : "OFAC · SDN navi"}
            :{" "}
            {s.status === "ok"
              ? "aggiornata"
              : s.status === "stale"
                ? "non aggiornata"
                : "non disponibile"}{" "}
            · {date(s.updated_at)}
          </p>
        ))}
        <p className="small muted">
          Sono consultate le fonti indicate, non tutti i regimi sanzionatori.
        </p>
      </section>
      <section>
        <h2>Soste rilevate · ultimi 90 giorni</h2>
        <p className="small muted">
          Località ricostruite dalle osservazioni; non sono porti identificati.
        </p>
        {stopsError ? (
          <p role="alert" className="notice">
            {stopsError}
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
                    ? "Fine osservata; partenza incerta."
                    : `Fine: ${date(s.departed_at)}`
                  : "Sosta in corso nelle ultime osservazioni."}
              </p>
            </div>
          ))
        ) : (
          <p className="muted">
            Nessuna sosta rilevata nella finestra disponibile.
          </p>
        )}
      </section>
      <section>
        <h2>Segnalazioni da verificare</h2>
        <p className="small muted">
          Le anomalie segnalano osservazioni insolite e non provano attività
          illecite.
        </p>
        {v.data_status === "partial" ? (
          <p className="notice">Controllo temporaneamente non disponibile.</p>
        ) : v.anomalies.length ? (
          v.anomalies.map((a, i) => (
            <div className="list-row" key={a.id ?? i}>
              <AnomalyBadge type={a.type} />
              <span className="small">{date(a.detected_at)}</span>
            </div>
          ))
        ) : (
          <p className="muted">Nessuna segnalazione registrata.</p>
        )}
      </section>
    </>
  );
}

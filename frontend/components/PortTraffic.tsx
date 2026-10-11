"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type {
  PortTraffic as Traffic,
  PortTrafficRow,
} from "../../shared/types";
import { useLanguage } from "./LanguageProvider";
type Tab = "expected" | "arrivals" | "departures" | "in_port";
type ResponseData = Traffic & { details: Record<string, unknown> };
const TABS: [Tab, string][] = [
  ["expected", "Attese"],
  ["arrivals", "Arrivi rilevati"],
  ["departures", "Partenze rilevate"],
  ["in_port", "In porto / rada"],
];
export default function PortTraffic({ portId }: { portId: string }) {
  const { t, date, numbers, shipNames } = useLanguage();
  const [data, setData] = useState<ResponseData | null>(null),
    [error, setError] = useState(false),
    [tab, setTab] = useState<Tab>("expected");
  const [query, setQuery] = useState(""),
    [type, setType] = useState(""),
    [flag, setFlag] = useState(""),
    [min, setMin] = useState(""),
    [max, setMax] = useState("");
  useEffect(() => {
    setData(null);
    setError(false);
    setQuery("");
    setType("");
    setFlag("");
    setMin("");
    setMax("");
    let stopped = false,
      controller: AbortController | undefined;
    async function load() {
      controller?.abort();
      controller = new AbortController();
      try {
        const response = await fetch(
          `/api/port-traffic?id=${encodeURIComponent(portId)}`,
          {
            signal: AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(20_000),
            ]),
          },
        );
        const value = await response.json();
        if (
          !response.ok ||
          value.port?.id !== portId ||
          !Array.isArray(value.expected)
        )
          throw new Error("unavailable");
        if (!stopped) {
          setData(value);
          setError(false);
        }
      } catch {
        if (!stopped && !controller.signal.aborted) setError(true);
      }
    }
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 60_000);
    return () => {
      stopped = true;
      controller?.abort();
      clearInterval(timer);
    };
  }, [portId]);
  const all = useMemo(
    () =>
      data
        ? [
            ...data.expected,
            ...data.arrivals,
            ...data.departures,
            ...data.in_port,
          ]
        : [],
    [data],
  );
  const flags = [...new Set(all.map((row) => row.flag).filter(Boolean))].sort();
  const rows = useMemo(
    () =>
      (data?.[tab] ?? []).filter((row) => {
        const match = `${row.name} ${row.mmsi} ${row.imo ?? ""}`
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase());
        return (
          match &&
          (!type || row.ship_type === type) &&
          (!flag || row.flag === flag) &&
          (!min || (row.length !== null && row.length >= Number(min))) &&
          (!max || (row.length !== null && row.length <= Number(max)))
        );
      }),
    [data, tab, query, type, flag, min, max],
  );
  const timing = (row: PortTrafficRow) =>
    tab === "expected"
      ? row.eta
      : tab === "in_port"
        ? row.observed_at
        : row.event_at;
  return (
    <section className="port-traffic" aria-label={t("Traffico portuale AIS")}>
      <h3>{t("Traffico portuale AIS")}</h3>
      {error && (
        <p role="alert" className="notice">
          {t(
            data
              ? "Aggiornamento non riuscito: sono mostrati i dati precedenti."
              : "Traffico portuale temporaneamente non disponibile.",
          )}
        </p>
      )}
      {!data && !error && <p role="status">{t("Caricamento…")}</p>}
      {data && (
        <>
          {data.scope === "outside_ais_coverage" ? (
            <p className="notice">
              {t(
                "Porto fuori dalla copertura AIS della demo. Sono disponibili solo i dati cartografici.",
              )}
            </p>
          ) : (
            <>
              <p className="port-traffic-note">
                {t(
                  "Destinazioni ed ETA sono dichiarazioni AIS. Presenze entro 3 km, incluse le rade; arrivi e partenze indicano inizio e fine delle soste rilevate nelle ultime 48 ore, non scali ufficiali.",
                )}
              </p>
              {!["live", "demo"].includes(data.source.status) && (
                <p className="notice">
                  {t(
                    "Acquisizione AIS non aggiornata: gli elenchi possono essere incompleti.",
                  )}
                </p>
              )}
              <div className="port-traffic-filters">
                <input
                  aria-label={t("Cerca nave, MMSI o IMO")}
                  placeholder={t("Cerca nave, MMSI o IMO")}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <select
                  aria-label={t("Tipo di nave")}
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                >
                  <option value="">{t("Tutti i tipi")}</option>
                  {Object.entries(shipNames).map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={t("Bandiera")}
                  value={flag}
                  onChange={(e) => setFlag(e.target.value)}
                >
                  <option value="">{t("Tutte le bandiere")}</option>
                  {flags.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
                <label>
                  {t("Lunghezza (m)")}
                  <span className="port-length-range">
                    <input
                      aria-label={t("Lunghezza minima")}
                      type="number"
                      min="0"
                      max="600"
                      placeholder={t("Min")}
                      value={min}
                      onChange={(e) => setMin(e.target.value)}
                    />
                    <input
                      aria-label={t("Lunghezza massima")}
                      type="number"
                      min="0"
                      max="600"
                      placeholder={t("Max")}
                      value={max}
                      onChange={(e) => setMax(e.target.value)}
                    />
                  </span>
                </label>
              </div>
              <div
                className="port-traffic-tabs"
                role="tablist"
                aria-label={t("Traffico portuale AIS")}
              >
                {TABS.map(([id, label]) => (
                  <button
                    id={`port-tab-${id}`}
                    key={id}
                    role="tab"
                    aria-selected={tab === id}
                    aria-controls={`port-panel-${id}`}
                    onClick={() => setTab(id)}
                  >
                    {t(label)} <span>{numbers(data[id].length)}</span>
                  </button>
                ))}
              </div>
              <div
                id={`port-panel-${tab}`}
                role="tabpanel"
                aria-labelledby={`port-tab-${tab}`}
                className="port-traffic-table"
                tabIndex={0}
              >
                {data.movements_status === "unavailable" &&
                  (tab === "arrivals" || tab === "departures") && (
                    <p className="notice">
                      {t(
                        "Archivio delle soste non disponibile: movimenti parziali.",
                      )}
                    </p>
                  )}
                <table>
                  <caption>
                    {t(TABS.find(([id]) => id === tab)![1])} ·{" "}
                    {numbers(rows.length)}
                  </caption>
                  <thead>
                    <tr>
                      <th>
                        {t(
                          tab === "expected"
                            ? "ETA dichiarata"
                            : tab === "in_port"
                              ? "Ultima osservazione"
                              : "Data evento",
                        )}
                      </th>
                      <th>{t("Nave")}</th>
                      <th>{t("Tipo / bandiera")}</th>
                      <th>{t("Dimensioni")}</th>
                      <th>{t("Distanza diretta")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, index) => (
                      <tr key={`${row.mmsi}:${row.event_at}:${index}`}>
                        <td>{timing(row) ? date(timing(row)!) : "—"}</td>
                        <td>
                          <Link href={`/vessel/${row.mmsi}`}>{row.name}</Link>
                          <small>
                            MMSI {row.mmsi}
                            {row.imo && ` · IMO ${row.imo}`}
                          </small>
                        </td>
                        <td>
                          {shipNames[row.ship_type]}
                          <small>{row.flag || "—"}</small>
                        </td>
                        <td>
                          {row.length === null
                            ? "—"
                            : `${numbers(row.length)} × ${row.width === null ? "—" : numbers(row.width)} m`}
                        </td>
                        <td>
                          {row.distance_nm === null
                            ? "—"
                            : `${numbers(Math.round(row.distance_nm * 10) / 10)} nm`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!rows.length && (
                  <p className="port-traffic-empty">
                    {t(
                      "Nessuna nave nei dati disponibili per questi filtri. Non esclude traffico non osservato.",
                    )}
                  </p>
                )}
              </div>
              <p className="port-traffic-note">
                {t(
                  "Distanza in linea diretta dall'ultima posizione, non una rotta navigabile. Ultimo porto, GT, DWT e anno di costruzione non sono disponibili dalla sorgente AIS attuale.",
                )}
              </p>
              {data.results_limited && (
                <p className="notice">
                  {t("Elenco limitato a 200 elementi per categoria.")}
                </p>
              )}
              <p className="port-traffic-note">
                {t("Aggiornato")}: {date(data.generated_at)} ·{" "}
                {t(
                  "Solo AIS Mediterraneo, indipendente dai filtri della mappa.",
                )}
              </p>
            </>
          )}
          <details className="port-services">
            <summary>{t("Caratteristiche e servizi del porto")}</summary>
            <dl>
              {[
                ["Profondità canale", "channel_depth"],
                ["Profondità ancoraggio", "anchorage_depth"],
                ["Profondità banchina merci", "cargo_pier_depth"],
                ["Pilotaggio disponibile", "pilotage_avail"],
                ["Pilotaggio obbligatorio", "pilotage_compulsory"],
                ["Assistenza rimorchiatori", "tugs_assist"],
                ["Ancoraggio disponibile", "fac_anchor"],
                ["Terminal container", "fac_container"],
                ["Terminal Ro-Ro", "fac_roro"],
                ["Carburante", "supply_fueloil"],
                ["Acqua", "supply_h2o"],
                ["Riparazioni", "repair_code"],
              ].map(([label, key]) =>
                data.details[key] !== null &&
                data.details[key] !== undefined ? (
                  <div key={key}>
                    <dt>{t(label)}</dt>
                    <dd>
                      {typeof data.details[key] === "number"
                        ? `${numbers(Number(data.details[key]))} m`
                        : t(String(data.details[key]))}
                    </dd>
                  </div>
                ) : null,
              )}
            </dl>
          </details>
        </>
      )}
    </section>
  );
}

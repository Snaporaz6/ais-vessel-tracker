"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FeatureCollection, Point, LineString } from "geojson";
import type {
  LiveMapResponse,
  ShipType,
  VesselPosition,
  TrackMetadata,
} from "../../shared/types";
import {
  splitTrack,
  mergePositions,
  downsampleTrack,
  observationGap,
} from "../../shared/history";
import { getLiveVessels, getTrack } from "../lib/api";
import { useLanguage } from "./LanguageProvider";
const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };
const COLORS: Record<ShipType, string> = {
  cargo: "#22c55e",
  tanker: "#f59e0b",
  passenger: "#3b82f6",
  fishing: "#06b6d4",
  tug: "#8b5cf6",
  pleasure: "#ec4899",
  military: "#6b7280",
  other: "#9ca3af",
};
type Props = {
  onVesselClick: (m: string) => void;
  trackMmsi: string | null;
  trackDays: number;
  visibleTypes: Set<ShipType>;
  onTypeCounts: (c: Record<string, number>) => void;
  isGlobe: boolean;
  center: VesselPosition | null;
};
export default function VesselMap({
  onVesselClick,
  trackMmsi,
  trackDays,
  visibleTypes,
  onTypeCounts,
  isGlobe,
  center,
}: Props) {
  const { t, date, shipNames, numbers, errorText, locale } = useLanguage();
  const language = useRef({ t, date, shipNames });
  const popup = useRef<maplibregl.Popup | null>(null);
  useEffect(() => {
    language.current = { t, date, shipNames };
  }, [t, date, shipNames]);
  const container = useRef<HTMLDivElement>(null),
    map = useRef<maplibregl.Map | null>(null),
    click = useRef(onVesselClick),
    projection = useRef(isGlobe);
  const [ready, setReady] = useState(false),
    [data, setData] = useState<LiveMapResponse | null>(null),
    [error, setError] = useState(""),
    [baseError, setBaseError] = useState(""),
    [trackError, setTrackError] = useState(""),
    [track, setTrack] = useState<VesselPosition[]>([]),
    [meta, setMeta] = useState<TrackMetadata | null>(null);
  useEffect(() => {
    click.current = onVesselClick;
    projection.current = isGlobe;
  }, [onVesselClick, isGlobe]);
  useEffect(() => {
    if (!container.current) return;
    // Next.js bundles do not keep MapLibre's worker and shared module together.
    maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
    const m = new maplibregl.Map({
      container: container.current,
      style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
      center: [15, 38],
      zoom: 4.5,
      minZoom: 2,
      maxZoom: 17,
      attributionControl: { compact: true },
      locale: {
        "Map.Title": language.current.t("Mappa delle navi"),
        "NavigationControl.ZoomIn": language.current.t("Ingrandisci"),
        "NavigationControl.ZoomOut": language.current.t("Riduci"),
        "NavigationControl.ResetBearing": language.current.t(
          "Ripristina orientamento",
        ),
        "AttributionControl.ToggleAttribution": language.current.t(
          "Mostra attribuzioni",
        ),
        "Popup.Close": language.current.t("Chiudi popup"),
      },
    });
    map.current = m;
    m.addControl(new maplibregl.NavigationControl(), "bottom-right");
    const resize = new ResizeObserver(() => m.resize());
    resize.observe(container.current);
    m.on("error", () =>
      setBaseError("La cartografia non è disponibile o è incompleta."),
    );
    m.on("style.load", () => {
      m.setProjection({ type: projection.current ? "globe" : "mercator" });
      m.resize();
      m.addSource("vessels", {
        type: "geojson",
        data: EMPTY,
        cluster: true,
        clusterMaxZoom: 9,
        clusterRadius: 40,
      });
      m.addLayer({
        id: "clusters",
        type: "circle",
        source: "vessels",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#2563eb",
          "circle-opacity": 0.8,
          "circle-radius": [
            "step",
            ["get", "point_count"],
            17,
            50,
            23,
            200,
            29,
          ],
          "circle-stroke-width": 1,
          "circle-stroke-color": "#60a5fa",
        },
      });
      m.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "vessels",
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-size": 12,
        },
        paint: { "text-color": "#fff" },
      });
      m.addLayer({
        id: "vessel-points",
        type: "circle",
        source: "vessels",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": ["get", "color"],
          "circle-radius": 6,
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#fff",
        },
      });
      m.addSource("track", { type: "geojson", data: EMPTY });
      m.addLayer({
        id: "track-line",
        type: "line",
        source: "track",
        filter: ["==", ["geometry-type"], "LineString"],
        paint: {
          "line-color": "#60a5fa",
          "line-width": 3,
          "line-opacity": 0.85,
        },
      });
      m.addLayer({
        id: "track-ends",
        type: "circle",
        source: "track",
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          "circle-color": ["get", "color"],
          "circle-radius": 6,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#fff",
        },
      });
      m.on("click", "vessel-points", (event) => {
        const f = event.features?.[0];
        if (!f || f.geometry.type !== "Point") return;
        const p = f.properties!,
          mmsi = String(p.mmsi);
        const { t, date, shipNames } = language.current;
        const content = document.createElement("div"),
          name = document.createElement("strong");
        name.textContent = String(p.name);
        content.append(name);
        for (const text of [
          mmsi,
          shipNames[p.ship_type as ShipType] ?? t("Tipo non disponibile"),
          p.speed == null ? t("Velocità non disponibile") : `${p.speed} kn`,
          date(String(p.timestamp)),
          p.is_sanctioned === true
            ? t("Corrispondenza sanzioni")
            : p.sanction_status === "no_match"
              ? t("Nessuna corrispondenza nelle liste consultate")
              : t("Controllo sanzioni non disponibile"),
        ]) {
          const row = document.createElement("p");
          row.textContent = text;
          content.append(row);
        }
        popup.current?.remove();
        popup.current = new maplibregl.Popup()
          .setLngLat((f.geometry as Point).coordinates as [number, number])
          .setDOMContent(content)
          .addTo(m);
        const close = popup.current
          .getElement()
          .querySelector(".maplibregl-popup-close-button");
        close?.setAttribute("aria-label", t("Chiudi popup"));
        close?.setAttribute("title", t("Chiudi popup"));
        click.current(mmsi);
      });
      m.on("click", "clusters", async (event) => {
        const f = event.features?.[0];
        if (!f || f.geometry.type !== "Point") return;
        const zoom = await (
          m.getSource("vessels") as maplibregl.GeoJSONSource
        ).getClusterExpansionZoom(Number(f.properties!.cluster_id));
        if (map.current === m)
          m.easeTo({
            center: (f.geometry as Point).coordinates as [number, number],
            zoom,
          });
      });
      for (const layer of ["vessel-points", "clusters"]) {
        m.on("mouseenter", layer, () => {
          m.getCanvas().style.cursor = "pointer";
        });
        m.on("mouseleave", layer, () => {
          m.getCanvas().style.cursor = "";
        });
      }
      setReady(true);
      setBaseError("");
    });
    return () => {
      resize.disconnect();
      m.remove();
      if (map.current === m) map.current = null;
      setReady(false);
    };
  }, []);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    let controller: AbortController | null = null,
      stopped = false;
    const load = async () => {
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal,
        b = m.getBounds();
      const bbox = [
        Math.max(-180, b.getWest()),
        Math.max(-90, b.getSouth()),
        Math.min(180, b.getEast()),
        Math.min(90, b.getNorth()),
      ];
      try {
        const value = await getLiveVessels(bbox.join(","), signal);
        if (!signal.aborted && !stopped) {
          setData(value);
          setError("");
        }
      } catch (e) {
        if (!signal.aborted && !stopped)
          setError(
            e instanceof Error ? e.message : "Posizioni non disponibili.",
          );
      }
    };
    void load();
    const timer = setInterval(() => void load(), 10_000);
    m.on("moveend", load);
    return () => {
      stopped = true;
      clearInterval(timer);
      controller?.abort();
      m.off("moveend", load);
    };
  }, [ready]);
  useEffect(() => {
    let c: AbortController | undefined;
    let stopped = false;
    setTrack([]);
    setMeta(null);
    setTrackError("");
    const load = () => {
      if (!trackMmsi || document.visibilityState === "hidden" || stopped)
        return;
      c?.abort();
      c = new AbortController();
      const signal = c.signal;
      getTrack(trackMmsi, trackDays, c.signal)
        .then(({ points, metadata }) => {
          if (!signal.aborted && !stopped) {
            setTrack(points);
            setMeta(metadata);
            setTrackError("");
          }
        })
        .catch((e) => {
          if (!signal.aborted && !stopped) setTrackError(e.message);
        });
    };
    load();
    const timer = setInterval(load, 60_000);
    document.addEventListener("visibilitychange", load);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
      c?.abort();
    };
  }, [trackMmsi, trackDays]);
  useEffect(() => {
    const counts: Record<string, number> = {};
    for (const v of data?.vessels ?? [])
      counts[v.ship_type] = (counts[v.ship_type] ?? 0) + 1;
    onTypeCounts(counts);
  }, [data, onTypeCounts]);
  const vessels = useMemo<FeatureCollection>(
    () => ({
      type: "FeatureCollection",
      features: (data?.vessels ?? [])
        .filter((v) => visibleTypes.has(v.ship_type))
        .map((v) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [v.lon, v.lat] },
          properties: {
            ...v,
            color: v.is_sanctioned ? "#ef4444" : COLORS[v.ship_type],
          },
        })),
    }),
    [data, visibleTypes],
  );
  const trackView = useMemo(() => {
    const live = data?.vessels.find((v) => v.mmsi === trackMmsi);
    const last = track.at(-1);
    if (!live || !last || live.timestamp <= last.timestamp)
      return { points: track, error: "" };
    const latest: VesselPosition = {
      mmsi: live.mmsi,
      timestamp: live.timestamp,
      lat: live.lat,
      lon: live.lon,
      speed: live.speed,
      course: live.course,
      heading: null,
      nav_status: "unknown",
    };
    latest.gap_before = observationGap(last, latest);
    try {
      return {
        points: downsampleTrack(mergePositions(track, [latest]), 5000),
        error: "",
      };
    } catch {
      return {
        points: track,
        error:
          "La traccia contiene troppe interruzioni per aggiungere l’ultima posizione. Scegli una finestra più breve.",
      };
    }
  }, [track, data, trackMmsi]);
  const displayedTrack = trackView.points;
  const lines = useMemo<FeatureCollection>(
    () => ({
      type: "FeatureCollection",
      features: [
        ...splitTrack(displayedTrack)
          .filter((s) => s.length > 1)
          .map((s) => ({
            type: "Feature" as const,
            properties: {},
            geometry: {
              type: "LineString" as const,
              coordinates: s.map((p) => [p.lon, p.lat]),
            } as LineString,
          })),
        ...(displayedTrack.length
          ? [
              {
                type: "Feature" as const,
                properties: { color: "#22c55e" },
                geometry: {
                  type: "Point" as const,
                  coordinates: [displayedTrack[0].lon, displayedTrack[0].lat],
                },
              },
              {
                type: "Feature" as const,
                properties: { color: "#f59e0b" },
                geometry: {
                  type: "Point" as const,
                  coordinates: [
                    displayedTrack.at(-1)!.lon,
                    displayedTrack.at(-1)!.lat,
                  ],
                },
              },
            ]
          : []),
      ],
    }),
    [displayedTrack],
  );
  useEffect(() => {
    if (ready)
      (
        map.current?.getSource("vessels") as
          maplibregl.GeoJSONSource | undefined
      )?.setData(vessels);
  }, [ready, vessels]);
  useEffect(() => {
    if (ready)
      (
        map.current?.getSource("track") as maplibregl.GeoJSONSource | undefined
      )?.setData(lines);
  }, [ready, lines]);
  useEffect(() => {
    if (ready)
      map.current?.setProjection({ type: isGlobe ? "globe" : "mercator" });
  }, [ready, isGlobe]);
  useEffect(() => {
    if (ready && center)
      map.current?.flyTo({
        center: [center.lon, center.lat],
        zoom: 9,
        essential: true,
      });
  }, [ready, center]);
  useEffect(() => {
    if (!ready || !map.current) return;
    popup.current?.remove();
    const controls = [
      [".maplibregl-canvas", "Mappa delle navi"],
      [".maplibregl-ctrl-zoom-in", "Ingrandisci"],
      [".maplibregl-ctrl-zoom-out", "Riduci"],
      [".maplibregl-ctrl-compass", "Ripristina orientamento"],
      [".maplibregl-ctrl-attrib-button", "Mostra attribuzioni"],
    ];
    for (const [selector, key] of controls) {
      const button = map.current.getContainer().querySelector(selector);
      button?.setAttribute("aria-label", t(key));
      button?.setAttribute("title", t(key));
    }
  }, [locale, ready, t]);
  const source = data?.source;
  return (
    <>
      <div
        ref={container}
        className="map-container"
        aria-label={t("Mappa delle navi")}
      />
      <div className="map-status" aria-live="polite">
        <strong>
          {source?.status === "demo"
            ? t("DEMO · dati interamente fittizi")
            : source?.status === "live"
              ? t("AIS · osservazioni live")
              : t("AIS · acquisizione non aggiornata")}
        </strong>
        <span>
          {data
            ? t(
                "{area} navi nell’area · {live} osservate negli ultimi 10 minuti",
                {
                  area: numbers(data.total_in_bbox),
                  live: numbers(data.total_live),
                },
              )
            : t("Caricamento osservazioni…")}
        </span>
        <span>
          {t("Ultima ricezione: {date}", {
            date: date(source?.last_message_at),
          })}
        </span>
        <span>
          {t("Storico disponibile dal {date}", {
            date: date(data?.history_started_at),
          })}
        </span>
        <span>
          {t("Copertura limitata alle osservazioni ricevute nel Mediterraneo.")}
        </span>
        {data?.truncated && (
          <p className="notice">
            {t("Visualizzate 5.000 navi: restringi l’area della mappa.")}
          </p>
        )}
        {error && (
          <p role="alert" className="notice">
            {errorText(error)}
          </p>
        )}
        {baseError && (
          <p role="alert" className="notice">
            {errorText(baseError)}
          </p>
        )}
        {(trackError || trackView.error) && (
          <p role="alert" className="notice">
            {t("Storico")}: {errorText(trackError || trackView.error)}
          </p>
        )}
        {meta && (
          <p className="small">
            {t("{count} punti", { count: numbers(displayedTrack.length) })} ·{" "}
            {meta.sampled ? `${t("traccia semplificata")} · ` : ""}
            {t("{count} interruzioni", {
              count: numbers(meta.gaps.length),
            })}{" "}
            ·{" "}
            {meta.first_at
              ? `${date(displayedTrack[0]?.timestamp ?? meta.first_at)} — ${date(displayedTrack.at(-1)?.timestamp ?? meta.last_at)}`
              : t("Nessuna osservazione nella finestra scelta.")}
          </p>
        )}
      </div>
    </>
  );
}

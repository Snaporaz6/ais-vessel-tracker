"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FeatureCollection, Point } from "geojson";
import type {
  LiveMapResponse,
  ShipType,
  VesselPosition,
  TrackMetadata,
} from "../../shared/types";
import {
  trackGaps,
  mergePositions,
  downsampleTrack,
  observationGap,
} from "../../shared/history";
import { getLiveVessels, getTrack } from "../lib/api";
import { trackGeometry, type TrackDisplayInfo } from "../lib/track-display";
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
  showGapLinks: boolean;
  onTrackInfo: (info: TrackDisplayInfo | null) => void;
};
export default function VesselMap({
  onVesselClick,
  trackMmsi,
  trackDays,
  visibleTypes,
  onTypeCounts,
  isGlobe,
  center,
  showGapLinks,
  onTrackInfo,
}: Props) {
  const { t, date, numbers, errorText, locale } = useLanguage();
  const language = useRef({ t });
  const popup = useRef<maplibregl.Popup | null>(null);
  useEffect(() => {
    language.current = { t };
  }, [t]);
  const container = useRef<HTMLDivElement>(null),
    map = useRef<maplibregl.Map | null>(null),
    click = useRef(onVesselClick),
    projection = useRef(isGlobe);
  const [bathymetry, setBathymetry] = useState(true),
    [bathymetryError, setBathymetryError] = useState(false),
    [mapZoom, setMapZoom] = useState(4.5);
  useEffect(() => {
    try {
      setBathymetry(localStorage.getItem("ais-bathymetry") !== "off");
    } catch {}
  }, []);
  const [ready, setReady] = useState(false),
    [data, setData] = useState<LiveMapResponse | null>(null),
    [error, setError] = useState(""),
    [baseError, setBaseError] = useState(""),
    [trackError, setTrackError] = useState(""),
    [track, setTrack] = useState<VesselPosition[]>([]),
    [meta, setMeta] = useState<(TrackMetadata & { mmsi: string }) | null>(null);
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
    m.on("error", (event) => {
      if ("sourceId" in event && event.sourceId === "bathymetry")
        setBathymetryError(true);
      else setBaseError("La cartografia non è disponibile o è incompleta.");
    });
    m.on("zoomend", () => setMapZoom(m.getZoom()));
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
        filter: [
          "all",
          ["==", ["geometry-type"], "LineString"],
          ["==", ["get", "kind"], "observed"],
        ],
        paint: {
          "line-color": "#60a5fa",
          "line-width": 3,
          "line-opacity": 0.85,
        },
      });
      m.addLayer({
        id: "track-gaps",
        type: "line",
        source: "track",
        filter: ["==", ["get", "kind"], "gap"],
        layout: { visibility: "none" },
        paint: {
          "line-color": "#f59e0b",
          "line-width": 2,
          "line-opacity": 0.7,
          "line-dasharray": [3, 3],
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
      // Hover labels never pan the map or capture pointer input.
      const label = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        focusAfterOpen: false,
        anchor: "bottom",
        offset: 12,
        maxWidth: "none",
        className: "vessel-name-tooltip",
      });
      popup.current = label;
      let hoveredName: string | null = null;
      m.on("mousemove", "vessel-points", (event) => {
        const f = event.features?.[0];
        if (!f || f.geometry.type !== "Point") return;
        const name = String(f.properties?.name || f.properties?.mmsi || "");
        if (name !== hoveredName) {
          label.setText(name);
          hoveredName = name;
        }
        label.setLngLat(event.lngLat);
        if (!label.isOpen()) label.addTo(m);
      });
      m.on("mouseleave", "vessel-points", () => label.remove());
      m.on("movestart", () => label.remove());
      m.on("click", "vessel-points", (event) => {
        const f = event.features?.[0];
        if (!f || f.geometry.type !== "Point") return;
        label.remove();
        m.stop();
        click.current(String(f.properties!.mmsi));
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
      popup.current?.remove();
      popup.current = null;
      m.remove();
      if (map.current === m) map.current = null;
      setReady(false);
    };
  }, []);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready || !bathymetry) return;
    setBathymetryError(false);
    // Below base labels and all vessel/track layers; transparent over water.
    const before =
      m.getStyle().layers.find((layer) => layer.type === "symbol")?.id ??
      "clusters";
    m.addSource("bathymetry", {
      type: "geojson",
      data: "/bathymetry/mediterranean-contours.json",
      tolerance: 0.2,
      maxzoom: 12,
      attribution:
        '<a href="https://emodnet.ec.europa.eu/en/bathymetry" target="_blank" rel="noopener">EMODnet Bathymetry</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>',
    });
    const groups = [
      { name: "major", minzoom: 4, depths: [1000, 2000, 5000, 7000] },
      { name: "middle", minzoom: 6, depths: [200, 500] },
      { name: "coastal", minzoom: 8, depths: [50, 100] },
    ];
    for (const group of groups) {
      m.addLayer(
        {
          id: `bathymetry-${group.name}`,
          type: "line",
          source: "bathymetry",
          minzoom: group.minzoom,
          filter: ["in", "depth", ...group.depths],
          paint: {
            "line-color": "#648797",
            "line-opacity": 0.65,
            "line-width": [
              "interpolate",
              ["linear"],
              ["zoom"],
              4,
              0.65,
              8,
              1,
              12,
              1.3,
            ],
          },
        },
        before,
      );
      m.addLayer(
        {
          id: `bathymetry-${group.name}-labels`,
          type: "symbol",
          source: "bathymetry",
          minzoom: group.minzoom,
          filter: ["in", "depth", ...group.depths],
          layout: {
            "symbol-placement": "line",
            "symbol-spacing": 250,
            "text-field": ["concat", ["to-string", ["get", "depth"]], " m"],
            "text-size": 11,
            "text-padding": 12,
          },
          paint: {
            "text-color": "#a2bac5",
            "text-halo-color": "#283237",
            "text-halo-width": 1.5,
          },
        },
        before,
      );
    }
    return () => {
      for (const group of groups) {
        for (const id of [
          `bathymetry-${group.name}-labels`,
          `bathymetry-${group.name}`,
        ])
          if (m.getLayer(id)) m.removeLayer(id);
      }
      if (m.getSource("bathymetry")) m.removeSource("bathymetry");
    };
  }, [ready, bathymetry]);
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
            setMeta({ ...metadata, mmsi: trackMmsi });
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
    if (!meta || meta.mmsi !== trackMmsi || meta.requested_days !== trackDays)
      return { points: [], error: "" };
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
  }, [track, data, trackMmsi, trackDays, meta]);
  const displayedTrack = trackView.points;
  const lines = useMemo(() => trackGeometry(displayedTrack), [displayedTrack]);
  const gaps = useMemo(() => trackGaps(displayedTrack), [displayedTrack]);
  useEffect(() => {
    if (!trackMmsi) {
      onTrackInfo(null);
      return;
    }
    const loaded =
      meta?.mmsi === trackMmsi && meta.requested_days === trackDays;
    onTrackInfo({
      mmsi: trackMmsi,
      days: trackDays,
      loading: !loaded && !trackError,
      error: trackError || trackView.error,
      count: displayedTrack.length,
      firstAt: displayedTrack[0]?.timestamp ?? null,
      lastAt: displayedTrack.at(-1)?.timestamp ?? null,
      gaps,
    });
  }, [
    trackMmsi,
    trackDays,
    meta,
    trackError,
    trackView.error,
    displayedTrack,
    gaps,
    onTrackInfo,
  ]);
  useEffect(() => {
    if (ready && map.current?.getLayer("track-gaps"))
      map.current.setLayoutProperty(
        "track-gaps",
        "visibility",
        showGapLinks ? "visible" : "none",
      );
  }, [ready, showGapLinks]);
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
    const m = map.current;
    if (ready && center && m)
      m.flyTo({
        center: [center.lon, center.lat],
        zoom: Math.max(m.getZoom(), 9),
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
      <div className="bathymetry-control">
        <button
          aria-pressed={bathymetry}
          aria-controls="bathymetry-legend"
          onClick={() =>
            setBathymetry((current) => {
              try {
                localStorage.setItem("ais-bathymetry", current ? "off" : "on");
              } catch {}
              return !current;
            })
          }
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path d="M2 7c4-5 7 5 11 0s6-2 9 0M2 12c4-5 7 5 11 0s6-2 9 0M2 17c4-5 7 5 11 0s6-2 9 0" />
          </svg>
          {t("Fondali")}
        </button>
        {bathymetry && (
          <div id="bathymetry-legend" className="bathymetry-legend">
            <span className="bathymetry-key">{t("Profondità in metri")}</span>
            <details>
              <summary>{t("Fonte e dettaglio")}</summary>
              <p>
                <a
                  href="https://emodnet.ec.europa.eu/en/bathymetry"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  EMODnet · CC BY 4.0
                </a>
              </p>
              <p>
                {t(
                  "Curve generalizzate: 50, 100, 200, 500, 1.000, 2.000, 5.000 e 7.000 m. Il dettaglio aumenta con lo zoom.",
                )}
              </p>
              <p>
                {t(
                  "Copertura del Mediterraneo. Non utilizzabile per la navigazione.",
                )}
              </p>
            </details>
            {mapZoom < 4 && (
              <p role="status">{t("Ingrandisci per vedere i fondali.")}</p>
            )}
            {bathymetryError && (
              <p role="status" className="notice">
                {t(
                  "Fondali temporaneamente incompleti. Disattiva e riattiva per riprovare.",
                )}
              </p>
            )}
          </div>
        )}
      </div>
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
              count: numbers(gaps.length),
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

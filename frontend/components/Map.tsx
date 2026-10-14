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
import MarineLayers from "./MarineLayers";
import MapStyleSelector from "./MapStyleSelector";
import { MapSetting, useMapUI } from "./MapUIProvider";
import { trackMoment } from "../lib/track-playback";
import { createTrackMarkers } from "../lib/track-markers";
import { viewportBounds } from "../lib/marine-map-layers";
import {
  addGlobalBathymetry,
  removeGlobalBathymetry,
} from "../lib/global-bathymetry";
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
  center: (VesselPosition & { preserveZoom?: boolean }) | null;
  selectedPosition: VesselPosition | null;
  showGapLinks: boolean;
  onTrackInfo: (info: TrackDisplayInfo | null) => void;
  playbackAt: number | null;
};
export default function VesselMap({
  onVesselClick,
  trackMmsi,
  trackDays,
  visibleTypes,
  onTypeCounts,
  isGlobe,
  center,
  selectedPosition,
  showGapLinks,
  onTrackInfo,
  playbackAt,
}: Props) {
  const { t, date, numbers, errorText, locale } = useLanguage();
  const { isMobile, panel, openPanel, closePanel } = useMapUI();
  const language = useRef({ t });
  const popup = useRef<maplibregl.Popup | null>(null);
  const trackMarkers = useRef<ReturnType<typeof createTrackMarkers> | null>(
    null,
  );
  const activeTrack = useRef(trackMmsi);
  const selectedMarkers = useRef<ReturnType<typeof createTrackMarkers> | null>(
    null,
  );
  const selectedVessel = useRef(selectedPosition?.mmsi);
  useEffect(() => {
    selectedVessel.current = selectedPosition?.mmsi;
  }, [selectedPosition]);
  useEffect(() => {
    activeTrack.current = trackMmsi;
  }, [trackMmsi]);
  useEffect(() => {
    language.current = { t };
  }, [t]);
  const container = useRef<HTMLDivElement>(null),
    map = useRef<maplibregl.Map | null>(null),
    click = useRef(onVesselClick),
    projection = useRef(isGlobe);
  const [bathymetry, setBathymetry] = useState(true),
    [bathymetryError, setBathymetryError] = useState(false),
    [outsideAIS, setOutsideAIS] = useState(false);
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
      minZoom: 1,
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
      if (
        "sourceId" in event &&
        (event.sourceId === "bathymetry" ||
          event.sourceId === "global-bathymetry")
      )
        setBathymetryError(true);
      else if (
        "sourceId" in event &&
        String(event.sourceId).startsWith("marine-")
      )
        return;
      else setBaseError("La cartografia non è disponibile o è incompleta.");
    });
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
        filter: ["==", ["get", "kind"], "isolated"],
        paint: {
          "circle-color": ["get", "color"],
          "circle-radius": 2.5,
          "circle-stroke-width": 0,
          "circle-stroke-color": "#fff",
        },
      });
      m.addLayer({
        id: "track-boundaries",
        type: "symbol",
        source: "track",
        filter: ["in", ["get", "kind"], ["literal", ["start", "gap-boundary"]]],
        layout: {
          "text-field": "+",
          "text-size": 14,
          "text-allow-overlap": true,
          "text-ignore-placement": true,
        },
        paint: {
          "text-color": ["get", "color"],
          "text-halo-color": "#17212d",
          "text-halo-width": 0.7,
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
        try {
          const zoom = await (
            m.getSource("vessels") as maplibregl.GeoJSONSource
          ).getClusterExpansionZoom(Number(f.properties!.cluster_id));
          if (map.current === m)
            m.easeTo({
              center: (f.geometry as Point).coordinates as [number, number],
              zoom,
            });
        } catch {
          // A refresh may have removed this cluster while its worker was responding.
        }
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
    addGlobalBathymetry(m, { beforeId: before, visible: true });
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
      removeGlobalBathymetry(m);
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
      const signal = controller.signal;
      const [west, south, east, north] = viewportBounds(m);
      const spans =
        west <= east
          ? [[west, east]]
          : [
              [west, 180],
              [-180, east],
            ];
      const intersections = spans
        .filter(([w, e]) => w < 36.5 && e > -6)
        .map(([w, e]) => [Math.max(-6, w), Math.min(36.5, e)]);
      if (!intersections.length || north <= 30 || south >= 46) {
        if (!stopped) {
          setOutsideAIS(true);
          setData(null);
          setError("");
        }
        return;
      }
      setOutsideAIS(false);
      const bbox = [
        Math.min(...intersections.map(([w]) => w)),
        Math.max(30, south),
        Math.max(...intersections.map(([, e]) => e)),
        Math.min(46, north),
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
    if (!trackMmsi) return;
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
        .filter(
          (v) =>
            visibleTypes.has(v.ship_type) &&
            v.mmsi !== selectedPosition?.mmsi &&
            !(
              v.mmsi === trackMmsi &&
              meta?.mmsi === trackMmsi &&
              meta.requested_days === trackDays &&
              track.length > 0
            ),
        )
        .map((v) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [v.lon, v.lat] },
          properties: {
            ...v,
            color: v.is_sanctioned ? "#ef4444" : COLORS[v.ship_type],
          },
        })),
    }),
    [
      data,
      visibleTypes,
      trackMmsi,
      trackDays,
      meta,
      track.length,
      selectedPosition?.mmsi,
    ],
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
  const moment = useMemo(() => {
    const selected = trackMoment(displayedTrack, playbackAt);
    const live = data?.vessels.find((v) => v.mmsi === trackMmsi);
    if (!selected || !live || live.timestamp <= selected.latest.timestamp)
      return selected;
    const latest: VesselPosition = {
      ...live,
      heading: null,
      nav_status: "unknown",
    };
    // Even when the sampled track cannot accept another point, its error must
    // not replace a newer live fix with an old location labelled as current.
    return {
      ...selected,
      latest,
      position: playbackAt === null ? latest : selected.position,
    };
  }, [displayedTrack, playbackAt, data, trackMmsi]);
  const selectedMoment = useMemo(() => {
    if (!selectedPosition || (moment && trackMmsi === selectedPosition.mmsi))
      return null;
    const live = data?.vessels.find((v) => v.mmsi === selectedPosition.mmsi);
    const fix: VesselPosition =
      live &&
      Date.parse(live.timestamp) > Date.parse(selectedPosition.timestamp)
        ? { ...live, heading: null, nav_status: "unknown" }
        : selectedPosition;
    return trackMoment([fix], null);
  }, [selectedPosition, data, moment, trackMmsi]);
  useEffect(() => {
    if (!ready || !map.current) return;
    const markers = createTrackMarkers(map.current, () => {
      if (activeTrack.current) click.current(activeTrack.current);
    });
    const selected = createTrackMarkers(
      map.current,
      () => {
        if (selectedVessel.current) click.current(selectedVessel.current);
      },
      true,
    );
    trackMarkers.current = markers;
    selectedMarkers.current = selected;
    return () => {
      markers.destroy();
      selected.destroy();
      trackMarkers.current = null;
      selectedMarkers.current = null;
    };
  }, [ready]);
  useEffect(() => {
    trackMarkers.current?.update(
      moment,
      `${t("Ultima posizione AIS")} · ${date(moment?.latest.timestamp)}`,
      `${t("Posizione storica")} · ${date(moment?.position?.timestamp)}`,
    );
  }, [ready, moment, t, date]);
  useEffect(() => {
    selectedMarkers.current?.update(
      selectedMoment,
      `${t("Ultima posizione AIS")} · ${date(selectedMoment?.latest.timestamp)}`,
      "",
    );
  }, [ready, selectedMoment, t, date]);
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
      positions: displayedTrack,
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
        zoom: center.preserveZoom ? m.getZoom() : Math.max(m.getZoom(), 9),
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
      {ready && map.current && <MapStyleSelector map={map.current} />}
      {ready && map.current && (
        <MarineLayers
          map={map.current}
          bathymetry={bathymetry}
          bathymetryError={bathymetryError}
          onBathymetryChange={() =>
            setBathymetry((current) => {
              try {
                localStorage.setItem("ais-bathymetry", current ? "off" : "on");
              } catch {}
              return !current;
            })
          }
          vessels={vessels}
          observedTrack={displayedTrack}
        />
      )}
      {isMobile && (
        <MapSetting>
          <button
            type="button"
            className="map-status-toggle"
            onClick={() => openPanel("status")}
          >
            {t("Stato dati")}
            <span>
              {source?.status === "live"
                ? "AIS"
                : source?.status === "demo"
                  ? "DEMO"
                  : "…"}
            </span>
          </button>
          {ready && (
            <div className="map-menu-navigation" aria-label={t("Zoom mappa")}>
              <span>{t("Zoom mappa")}</span>
              <button
                type="button"
                aria-label={t("Riduci")}
                onClick={() => map.current?.zoomOut()}
              >
                −
              </button>
              <button
                type="button"
                aria-label={t("Ingrandisci")}
                onClick={() => map.current?.zoomIn()}
              >
                +
              </button>
              <button
                type="button"
                aria-label={t("Ripristina orientamento")}
                onClick={() => map.current?.resetNorth()}
              >
                ↑ N
              </button>
            </div>
          )}
        </MapSetting>
      )}
      {isMobile &&
        ((source && source.status !== "live") ||
          error ||
          baseError ||
          outsideAIS) && (
          <div className="mobile-source-badge" role="status">
            {source?.status === "demo"
              ? "DEMO"
              : outsideAIS
                ? t("AIS nel Mediterraneo")
                : t("Dati non aggiornati")}
          </div>
        )}
      <div
        className="map-status"
        aria-live="polite"
        hidden={isMobile && panel !== "status"}
      >
        {isMobile && (
          <div className="mobile-sheet-heading">
            <h2>{t("Stato dati")}</h2>
            <button
              type="button"
              aria-label={t("Chiudi stato dati")}
              onClick={closePanel}
            >
              ×
            </button>
          </div>
        )}
        <strong>
          {outsideAIS
            ? t("Mappa globale · AIS della demo nel Mediterraneo")
            : source?.status === "demo"
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
            : outsideAIS
              ? t(
                  "Nessuna acquisizione AIS fuori dal Mediterraneo in questa demo.",
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

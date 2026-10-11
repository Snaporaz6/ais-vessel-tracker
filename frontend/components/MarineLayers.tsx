"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Popup,
  type Map as MarineMap,
  type GeoJSONSource,
  type MapMouseEvent,
  type ErrorEvent as MapErrorEvent,
} from "maplibre-gl";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { useLanguage } from "./LanguageProvider";
import { MapSetting, useMapUI } from "./MapUIProvider";
import {
  MAP_LAYERS,
  LAYER_GROUPS,
  type MapLayerId,
} from "../lib/map-layer-catalog";
import {
  addMarineLayer,
  removeMarineLayer,
  marineLayerIds,
  sourceId,
  viewportBounds,
  featureDetails,
  type MarineCollection,
  type LayerMetadata,
} from "../lib/marine-map-layers";
import {
  assessObservedTrack,
  NGA_DISCLAIMER,
  type MaritimeWarningCollection,
} from "../lib/maritime-warnings";
import {
  cachedMarineRequest,
  MARINE_DAY_MS,
  WARNING_REFRESH_MS,
  regionalBounds,
  marineDetailZoom,
  containsBounds,
  type Bounds,
} from "../lib/marine-cache";
import { onshorePortMarkers } from "../lib/port-markers";
import PortTraffic from "./PortTraffic";
import type { VesselPosition } from "../../shared/types";

type SelectedFeature = { layer: MapLayerId; feature: Feature<Geometry> };
type LayerState = {
  loading?: boolean;
  error?: boolean;
  metadata?: LayerMetadata;
  count?: number;
};
type Props = {
  map: MarineMap;
  bathymetry: boolean;
  bathymetryError: boolean;
  onBathymetryChange: () => void;
  vessels: FeatureCollection;
  observedTrack: VesselPosition[];
};
function safeLink(value: unknown): string | undefined {
  if (typeof value !== "string") return;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" || url.protocol === "http:") return url.href;
  } catch {}
}
function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : "";
}
const STORAGE = "ais-global-layers-v1";
export default function MarineLayers({
  map,
  bathymetry,
  bathymetryError,
  onBathymetryChange,
  vessels,
  observedTrack,
}: Props) {
  const { t, date, numbers } = useLanguage();
  const { isMobile, panel, openPanel, closePanel } = useMapUI();
  const [desktopOpen, setDesktopOpen] = useState(false);
  const open = isMobile ? panel === "layers" : desktopOpen;
  const [enabled, setEnabled] = useState<MapLayerId[]>(["warnings"]);
  const [hydrated, setHydrated] = useState(false);
  const [states, setStates] = useState<Partial<Record<MapLayerId, LayerState>>>(
    {},
  );
  const [selected, setSelected] = useState<SelectedFeature | null>(null);
  const [days, setDays] = useState(30);
  const [warningType, setWarningType] = useState("all");
  const [activeOnly, setActiveOnly] = useState(false);
  const [forecastHours, setForecastHours] = useState(0);
  const [warnings, setWarnings] = useState<MaritimeWarningCollection | null>(
    null,
  );
  const [retry, setRetry] = useState(0);
  const loaded = useRef(
    new Map<
      string,
      { bounds: Bounds; zoom: number; expires: number; value: MarineCollection }
    >(),
  );
  const regions = useRef(
    new Map<
      string,
      { layer: MapLayerId; value: MarineCollection; expires: number }
    >(),
  );
  const visibleData = useRef(new Map<MapLayerId, MarineCollection>());
  const enabledKey = enabled.slice().sort().join(",");
  useEffect(() => {
    if (isMobile && panel === "feature" && !selected) closePanel();
  }, [isMobile, panel, selected, closePanel]);
  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(
        localStorage.getItem(STORAGE) ?? "null",
      );
      if (Array.isArray(saved))
        setEnabled(
          saved.filter(
            (id): id is MapLayerId =>
              typeof id === "string" &&
              MAP_LAYERS.some((layer) => layer.id === id),
          ),
        );
    } catch {}
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(
        STORAGE,
        JSON.stringify(enabledKey ? enabledKey.split(",") : []),
      );
    } catch {}
  }, [enabledKey, hydrated]);
  function toggle(id: MapLayerId) {
    setEnabled((current) =>
      current.includes(id)
        ? current.filter((entry) => entry !== id)
        : [...current, id],
    );
    if (selected?.layer === id) setSelected(null);
  }
  useEffect(() => {
    if (!hydrated) return;
    setSelected((current) => (current?.layer === "warnings" ? null : current));
    setWarnings(null);
    let stopped = false;
    let controller: AbortController | null = null;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const definitions = MAP_LAYERS.filter(
      (layer) =>
        enabledKey.split(",").includes(layer.id) &&
        layer.id !== "density" &&
        layer.id !== "position-age",
    );
    for (const layer of MAP_LAYERS) {
      if (
        !["density", "position-age"].includes(layer.id) &&
        !definitions.includes(layer)
      )
        removeMarineLayer(map, layer.id);
    }
    for (const definition of definitions) {
      if (!map.getSource(sourceId(definition.id)))
        addMarineLayer(map, definition);
    }
    const tooltip = new Popup({
      closeButton: false,
      closeOnClick: false,
      focusAfterOpen: false,
      anchor: "bottom",
      offset: 10,
      className: "vessel-name-tooltip",
    });
    const ids = definitions.flatMap((layer) => marineLayerIds(layer.id));
    function pick(event: MapMouseEvent) {
      if (!ids.length) return;
      const features = map.queryRenderedFeatures(event.point, { layers: ids });
      return (
        features.find(
          (feature) =>
            feature.geometry.type === "Point" ||
            feature.geometry.type === "MultiPoint",
        ) ??
        features.find(
          (feature) =>
            feature.layer.type === "symbol" || feature.layer.type === "line",
        ) ??
        features[0]
      );
    }
    function hover(event: MapMouseEvent) {
      if (
        map.queryRenderedFeatures(event.point, {
          layers: ["vessel-points", "clusters"],
        }).length
      ) {
        tooltip.remove();
        return;
      }
      const feature = pick(event);
      if (!feature) {
        tooltip.remove();
        return;
      }
      const name = text(feature.properties?.name);
      if (name) tooltip.setLngLat(event.lngLat).setText(name).addTo(map);
      else tooltip.remove();
    }
    function click(event: MapMouseEvent) {
      if (
        map.queryRenderedFeatures(event.point, {
          layers: ["vessel-points", "clusters"],
        }).length
      )
        return;
      const feature = pick(event);
      if (!feature) return;
      const definition = definitions.find((layer) =>
        marineLayerIds(layer.id).includes(feature.layer.id),
      );
      if (definition) {
        tooltip.remove();
        setSelected({ layer: definition.id, feature: featureDetails(feature) });
        openPanel("feature");
      }
    }
    async function load() {
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      const bounds = viewportBounds(map);
      const bbox = bounds.map((value) => value.toFixed(3)).join(",");
      const zoom = Math.floor(map.getZoom());
      const tasks = definitions.slice();
      const forecast = definitions.filter(
        (layer) => layer.id === "waves" || layer.id === "currents",
      );
      let forecastRequest: Promise<MarineCollection> | undefined;
      const request = (url: string, ttl = MARINE_DAY_MS) =>
        cachedMarineRequest(url, ttl, signal);
      const worker = async () => {
        while (tasks.length && !signal.aborted && !stopped) {
          const layer = tasks.shift()!;
          const source = map.getSource(sourceId(layer.id)) as
            GeoJSONSource | undefined;
          setStates((current) => ({
            ...current,
            [layer.id]: { ...current[layer.id], loading: true },
          }));
          if (zoom < layer.minZoom) {
            setStates((current) => ({
              ...current,
              [layer.id]: {
                metadata: {
                  status: "zoom-required",
                  message: "mapData.zoomRequired",
                  minZoom: layer.minZoom,
                },
              },
            }));
            continue;
          }
          try {
            let value: MarineCollection;
            let regionKey = "";
            if (layer.id === "warnings") {
              value = await request(
                `/api/maritime-warnings?days=${days}&type=${warningType}`,
                WARNING_REFRESH_MS,
              );
            } else if (forecast.some((entry) => entry.id === layer.id)) {
              forecastRequest ??= request(
                `/api/marine-forecast?bbox=${encodeURIComponent(bbox)}&zoom=${zoom}&hours=${forecastHours}`,
                15 * 60_000,
              );
              value = await forecastRequest;
            } else {
              const detailZoom = Math.max(
                layer.minZoom,
                marineDetailZoom(layer.id, zoom),
              );
              const prior = loaded.current.get(layer.id);
              const region = regionalBounds(bounds, layer.id, zoom);
              regionKey = `${layer.id}:${detailZoom}:${region.join(",")}`;
              if (
                prior &&
                prior.zoom === detailZoom &&
                prior.expires > Date.now() &&
                containsBounds(prior.bounds, bounds)
              )
                value = prior.value;
              else {
                value = await request(
                  `/api/map-data?layer=${layer.id}&bbox=${encodeURIComponent(region.join(","))}&zoom=${detailZoom}&day=${new Date().toISOString().slice(0, 10)}`,
                );
                if (
                  !signal.aborted &&
                  value.metadata.status !== "zoom-required"
                )
                  loaded.current.set(layer.id, {
                    bounds: region,
                    zoom: detailZoom,
                    expires:
                      value.metadata.cacheExpiresAt ??
                      Date.now() +
                        (value.metadata.status === "partial"
                          ? 15 * 60_000
                          : MARINE_DAY_MS),
                    value,
                  });
              }
            }
            if (signal.aborted || stopped) continue;
            if (layer.id === "warnings")
              value = {
                ...value,
                features: value.features.map((feature) => {
                  const props = feature.properties;
                  if (
                    props?.active === true &&
                    (Date.now() - Date.parse(props.updatedAt) >
                      WARNING_REFRESH_MS ||
                      (props.validUntil &&
                        Date.parse(props.validUntil) < Date.now()))
                  )
                    return {
                      ...feature,
                      properties: { ...props, active: false, status: "stale" },
                    };
                  return feature;
                }),
              };
            const features = value.features.filter((feature) => {
              if (layer.id === "warnings" && activeOnly)
                return feature.properties?.active === true;
              if (layer.id === "waves")
                return Number.isFinite(feature.properties?.waveHeight);
              if (layer.id === "currents")
                return (
                  Number.isFinite(feature.properties?.currentVelocity) &&
                  Number.isFinite(feature.properties?.currentDirection)
                );
              return true;
            });
            const dynamic = ["warnings", "waves", "currents"].includes(
              layer.id,
            );
            const previous = visibleData.current.get(layer.id);
            const unique = new Map<string, (typeof features)[number]>();
            if (!dynamic) {
              regions.current.delete(regionKey);
              regions.current.set(regionKey, {
                layer: layer.id,
                value,
                expires:
                  value.metadata.cacheExpiresAt ?? Date.now() + MARINE_DAY_MS,
              });
              for (const [key, entry] of regions.current)
                if (entry.expires <= Date.now()) regions.current.delete(key);
              while (regions.current.size > 48)
                regions.current.delete(regions.current.keys().next().value!);
              for (const entry of regions.current.values())
                if (entry.layer === layer.id)
                  for (const feature of entry.value.features)
                    unique.set(
                      `${feature.properties?.source}:${feature.properties?.id ?? feature.id ?? JSON.stringify(feature.geometry)}`,
                      feature,
                    );
            }
            for (const feature of features)
              unique.set(
                `${feature.properties?.source}:${feature.properties?.id ?? feature.id ?? JSON.stringify(feature.geometry)}`,
                feature,
              );
            // Keep recently loaded neighbouring geometry visible across viewport changes.
            const display = {
              ...value,
              features: [...unique.values()].slice(-12_000),
            };
            visibleData.current.set(layer.id, display);
            if (
              !previous ||
              JSON.stringify(previous.features) !==
                JSON.stringify(display.features)
            )
              source?.setData(
                layer.id === "ports"
                  ? onshorePortMarkers(map, display)
                  : display,
              );
            setStates((current) => ({
              ...current,
              [layer.id]: {
                metadata: value.metadata,
                count: features.length,
                error:
                  value.metadata?.status === "error" ||
                  value.metadata?.status === "unavailable",
              },
            }));
            if (layer.id === "warnings")
              setWarnings(value as unknown as MaritimeWarningCollection);
          } catch {
            if (signal.aborted || stopped) continue;
            setStates((current) => ({
              ...current,
              [layer.id]: {
                ...current[layer.id],
                loading: false,
                error: true,
                metadata: {
                  ...current[layer.id]?.metadata,
                  status: "error",
                  message: "mapData.unavailable",
                },
              },
            }));
            if (layer.id === "warnings") {
              setWarnings(null);
              const prior = visibleData.current.get("warnings");
              if (prior) {
                const stale = {
                  ...prior,
                  features: prior.features
                    .filter(() => !activeOnly)
                    .map((feature) => ({
                      ...feature,
                      properties: {
                        ...feature.properties,
                        active: false,
                        status: "stale",
                      },
                    })),
                };
                visibleData.current.set("warnings", stale);
                source?.setData(stale);
              }
              setSelected((current) =>
                current?.layer === "warnings" ? null : current,
              );
            }
          }
        }
      };
      await Promise.all([worker(), worker(), worker()]);
    }
    function moved() {
      tooltip.remove();
      controller?.abort();
      clearTimeout(debounce);
      debounce = setTimeout(() => void load(), 600);
    }
    void load();
    const refresh = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 60_000);
    map.on("moveend", moved);
    map.on("mousemove", hover);
    map.on("click", click);
    return () => {
      stopped = true;
      controller?.abort();
      clearTimeout(debounce);
      clearInterval(refresh);
      map.off("moveend", moved);
      map.off("mousemove", hover);
      map.off("click", click);
      tooltip.remove();
      // Sources stay mounted when filters change. Disabled layers are removed above.
    };
  }, [
    map,
    enabledKey,
    hydrated,
    days,
    warningType,
    activeOnly,
    forecastHours,
    retry,
    openPanel,
  ]);
  useEffect(() => {
    if (!enabledKey.split(",").includes("ports")) return;
    let last = "";
    const place = () => {
      const data = visibleData.current.get("ports");
      const source = map.getSource(sourceId("ports")) as
        GeoJSONSource | undefined;
      if (!data || !source) return;
      const placed = onshorePortMarkers(map, data);
      const signature = JSON.stringify(
        placed.features.map((feature) => feature.geometry),
      );
      if (signature !== last) {
        last = signature;
        source.setData(placed);
      }
    };
    map.on("idle", place);
    return () => {
      map.off("idle", place);
    };
  }, [map, enabledKey]);
  useEffect(() => {
    if (!enabledKey.split(",").includes("position-age")) {
      removeMarineLayer(map, "position-age");
      return;
    }
    const layer = MAP_LAYERS.find(
      (definition) => definition.id === "position-age",
    )!;
    if (!map.getSource(sourceId(layer.id))) addMarineLayer(map, layer);
    const aged: FeatureCollection = {
      type: "FeatureCollection",
      features: vessels.features.flatMap((feature) => {
        const timestamp = Date.parse(text(feature.properties?.timestamp));
        if (!Number.isFinite(timestamp)) return [];
        const ageMinutes = Math.max(0, (Date.now() - timestamp) / 60_000);
        return ageMinutes >= 10
          ? [{ ...feature, properties: { ...feature.properties, ageMinutes } }]
          : [];
      }),
    };
    (map.getSource(sourceId(layer.id)) as GeoJSONSource).setData(aged);
  }, [map, enabledKey, vessels]);
  useEffect(() => {
    if (!enabled.includes("density")) return;
    const before =
      map.getStyle().layers.find((layer) => layer.type === "symbol")?.id ??
      "clusters";
    map.addSource("marine-density", {
      type: "raster",
      tiles: [location.origin + "/api/traffic-density/{z}/{x}/{y}"],
      tileSize: 256,
      minzoom: 3,
      maxzoom: 10,
      bounds: [-87.706, 14.961, 97.633, 85.051],
      attribution:
        '<a href="https://emodnet.ec.europa.eu/en/human-activities" target="_blank" rel="noopener">EMODnet vessel density 2024</a>',
    });
    map.addLayer(
      {
        id: "marine-density-raster",
        type: "raster",
        source: "marine-density",
        minzoom: 3,
        paint: {
          "raster-opacity": 0.35,
          "raster-saturation": -0.55,
          "raster-fade-duration": 0,
        },
      },
      before,
    );
    function error(event: MapErrorEvent) {
      if ("sourceId" in event && event.sourceId === "marine-density")
        setStates((current) => ({
          ...current,
          density: {
            error: true,
            metadata: { message: "mapData.unavailable" },
          },
        }));
    }
    map.on("error", error);
    setStates((current) => ({
      ...current,
      density: {
        metadata: {
          source: "EMODnet",
          sourceUrl: "https://emodnet.ec.europa.eu/en/human-activities",
          coverage: "Acque europee",
          updatedAt: null,
          message:
            "EMODnet 2024: acque europee, media annua in ore nave/km²/mese.",
        },
      },
    }));
    return () => {
      map.off("error", error);
      if (map.getLayer("marine-density-raster"))
        map.removeLayer("marine-density-raster");
      if (map.getSource("marine-density")) map.removeSource("marine-density");
    };
  }, [map, enabledKey, retry]);
  const trackAlerts = useMemo(() => {
    if (!warnings || !observedTrack.length) return [];
    const matches = new Set<string>();
    let segment: VesselPosition[] = [];
    const assess = () => {
      if (segment.length)
        for (const id of assessObservedTrack(
          segment.map((position) => [position.lon, position.lat]),
          warnings,
        ).alertIds)
          matches.add(id);
    };
    for (const position of observedTrack) {
      if (position.gap_before) {
        assess();
        segment = [];
      }
      segment.push(position);
    }
    assess();
    return [...matches];
  }, [warnings, observedTrack]);
  const properties = selected?.feature.properties;
  const trackAlertMessage =
    !warnings || warnings.metadata.status === "unavailable"
      ? t("Avvisi non disponibili.")
      : trackAlerts.length
        ? t("{count} avvisi attivi sulla traccia.", {
            count: numbers(trackAlerts.length),
          })
        : t("Nessun avviso attivo rilevato. Copertura parziale.");
  const definition = MAP_LAYERS.find((layer) => layer.id === selected?.layer);
  const featureSource =
    safeLink(properties?.sourceUrl) ??
    safeLink(states[selected?.layer ?? "ports"]?.metadata?.sourceUrl);
  const nearVessels = useMemo(() => {
    if (
      !selected ||
      selected.feature.geometry.type !== "Point" ||
      !["ports", "anchorages"].includes(selected.layer)
    )
      return null;
    const [lon, lat] = selected.feature.geometry.coordinates;
    if (lon < -6 || lon > 36.5 || lat < 30 || lat > 46) return null;
    let stopped = 0,
      total = 0;
    for (const feature of vessels.features) {
      if (feature.geometry.type !== "Point") continue;
      const [x, y] = feature.geometry.coordinates;
      const dx = (x - lon) * Math.cos((lat * Math.PI) / 180) * 111.2,
        dy = (y - lat) * 111.2;
      const age = Date.now() - Date.parse(text(feature.properties?.timestamp));
      if (Math.hypot(dx, dy) > 5 || !Number.isFinite(age) || age > 10 * 60_000)
        continue;
      total++;
      if (
        typeof feature.properties?.speed === "number" &&
        feature.properties.speed <= 0.5
      )
        stopped++;
    }
    return { total, stopped };
  }, [selected, vessels]);
  function statusLabel(id: MapLayerId) {
    const state = states[id];
    if (state?.loading)
      return t(state.count ? "Dati in aggiornamento…" : "Caricamento…");
    if (state?.error) return t("mapData.unavailable");
    if (state?.metadata?.status === "zoom-required")
      return t("Zoom minimo: {zoom}", {
        zoom:
          state.metadata.minZoom ??
          MAP_LAYERS.find((layer) => layer.id === id)!.minZoom,
      });
    if (state?.metadata?.status === "partial")
      return t("{count} elementi · copertura parziale", {
        count: numbers(state.count ?? 0),
      });
    return t("{count} elementi nella vista", {
      count: numbers(state?.count ?? 0),
    });
  }
  function sourceDate(value: unknown) {
    const raw = text(value);
    return /^\d{4}(-\d{2}){0,2}$/.test(raw) ? raw : date(raw);
  }
  function measured(value: unknown) {
    return typeof value === "number" && Number.isFinite(value)
      ? `${numbers(Math.round(value * 10) / 10)} m`
      : text(value);
  }
  function layerInformation(id: MapLayerId) {
    const metadata = states[id]?.metadata;
    return (
      <>
        <p>{t(MAP_LAYERS.find((layer) => layer.id === id)!.description)}</p>
        {metadata?.message && <p>{t(metadata.message)}</p>}
        <p>
          {t(
            id === "warnings"
              ? "Aggiornamento ogni 30 minuti."
              : id === "waves" || id === "currents"
                ? "Previsioni aggiornate ogni 15 minuti."
                : "Dati cartografici riutilizzati fino a 24 ore per area.",
          )}
        </p>
        {metadata?.minZoom && (
          <p>
            {t("Ingrandisci almeno a zoom {zoom}.", { zoom: metadata.minZoom })}
          </p>
        )}
        {metadata?.source && (
          <p>
            {t("Fonte")}: {metadata.source}
          </p>
        )}
        {metadata?.coverage && (
          <p>
            {t("Copertura")}: {t(metadata.coverage)}
          </p>
        )}
        {metadata?.updatedAt && (
          <p>
            {t("Data della fonte")}: {sourceDate(metadata.updatedAt)}
          </p>
        )}
        {metadata?.updatedAt === null && (
          <p>{t("Data di aggiornamento non pubblicata dalla fonte.")}</p>
        )}
        {metadata?.fetchedAt && (
          <p>
            {t("Ultima consultazione")}: {date(metadata.fetchedAt)}
          </p>
        )}
        {metadata?.forecastValidTime && (
          <p>
            {t("Validità previsione")}: {date(metadata.forecastValidTime)}
          </p>
        )}
        {metadata?.license && (
          <p>
            {t("Licenza")}: {metadata.license}
          </p>
        )}
        {id === "density" && (
          <p>
            {t(
              "Copertura AIS satellitare incompleta dal giugno 2024: confronti fra anni limitati.",
            )}
          </p>
        )}
        {[
          "internal",
          "territorial",
          "contiguous",
          "eez",
          "highseas",
          "shelf",
        ].includes(id) && (
          <p>
            {t(
              "Rame: rivendicazioni, proposte o regimi congiunti indicati dalla fonte. I confini sono generalizzati e non hanno valore legale.",
            )}
          </p>
        )}
        {metadata?.sources?.map((source, index) => (
          <div className="marine-source-status" key={index}>
            <strong>{source.source ?? source.name}</strong> ·{" "}
            {t(source.status ?? "unspecified")}
            {source.message && <p>{t(source.message)}</p>}
            {source.attribution && <p lang="en">{source.attribution}</p>}
            {source.fetchedAt && (
              <p>
                {t("Ultima consultazione")}: {date(source.fetchedAt)}
              </p>
            )}
            {source.checkedAt && (
              <p>
                {t("Ultimo tentativo")}: {date(source.checkedAt)}
              </p>
            )}
            {!!source.unmappedCount && (
              <p>
                {t("{count} segnalazioni senza coordinate utilizzabili.", {
                  count: numbers(source.unmappedCount),
                })}
              </p>
            )}
            {safeLink(source.sourceUrl ?? source.url) && (
              <a
                href={safeLink(source.sourceUrl ?? source.url)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("Apri fonte")}
              </a>
            )}
          </div>
        ))}
        {safeLink(metadata?.sourceUrl) && (
          <a
            href={safeLink(metadata?.sourceUrl)}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("Apri fonte")}
          </a>
        )}
        {(states[id]?.error || metadata?.status === "partial") && (
          <button onClick={() => setRetry((value) => value + 1)}>
            {t("Riprova")}
          </button>
        )}
      </>
    );
  }
  return (
    <>
      <div className="marine-layers-control">
        <MapSetting>
          <button
            className="marine-layers-toggle"
            aria-expanded={open}
            aria-controls="marine-layer-panel"
            onClick={() => {
              if (isMobile) {
                if (open) closePanel();
                else openPanel("layers");
              } else setDesktopOpen((value) => !value);
            }}
          >
            <svg
              width="19"
              height="19"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <path d="m3 7 9-4 9 4-9 4-9-4Zm0 5 9 4 9-4M3 17l9 4 9-4" />
            </svg>
            {t("Livelli mappa")}{" "}
            <span>{numbers(enabled.length + (bathymetry ? 1 : 0))}</span>
          </button>
        </MapSetting>
        {open && (
          <div id="marine-layer-panel" className="marine-layer-panel">
            <div className="marine-panel-heading">
              <strong>{t("Mappa globale")}</strong>
              <button
                aria-label={t("Chiudi livelli")}
                onClick={() => {
                  if (isMobile) closePanel();
                  else setDesktopOpen(false);
                }}
              >
                ×
              </button>
            </div>
            <details className="marine-layer-info">
              <summary>{t("Copertura e limiti")}</summary>
              <p className="marine-panel-note">
                {t(
                  "AIS della demo nel Mediterraneo. Gli altri livelli dipendono dalla copertura delle fonti.",
                )}
              </p>
            </details>
            <label className="marine-layer-row">
              <input
                type="checkbox"
                checked={bathymetry}
                onChange={onBathymetryChange}
              />
              <span
                className="marine-layer-swatch"
                style={{ background: "#648797" }}
              />
              <span>{t("Fondali")}</span>
            </label>
            {bathymetry && (
              <details className="marine-layer-info">
                <summary>{t("Fonte e dettaglio")}</summary>
                <p>
                  {t(
                    "GEBCO 2025 globale generalizzato; EMODnet nel Mediterraneo da zoom 4. Profondità in metri.",
                  )}
                </p>
                <p>{t("Non utilizzabile per la navigazione.")}</p>
                <a
                  href="https://www.gebco.net/data-products/gridded-bathymetry-data"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  GEBCO
                </a>{" "}
                ·{" "}
                <a
                  href="https://emodnet.ec.europa.eu/en/bathymetry"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  EMODnet · CC BY 4.0
                </a>
                {bathymetryError && (
                  <p role="status">
                    {t(
                      "Fondali temporaneamente incompleti. Disattiva e riattiva per riprovare.",
                    )}
                  </p>
                )}
              </details>
            )}
            {LAYER_GROUPS.map((group) => (
              <fieldset key={group}>
                <legend>{t(group)}</legend>
                {MAP_LAYERS.filter((layer) => layer.group === group).map(
                  (layer) => (
                    <div key={layer.id}>
                      <label className="marine-layer-row">
                        <input
                          type="checkbox"
                          checked={enabled.includes(layer.id)}
                          onChange={() => toggle(layer.id)}
                        />
                        <span
                          className="marine-layer-swatch"
                          style={{ background: layer.color }}
                        />
                        <span>{t(layer.name)}</span>
                      </label>
                      {enabled.includes(layer.id) && (
                        <details className="marine-layer-info">
                          <summary>{statusLabel(layer.id)}</summary>
                          {layerInformation(layer.id)}
                        </details>
                      )}
                    </div>
                  ),
                )}
              </fieldset>
            ))}
            {enabled.includes("warnings") && (
              <div className="marine-warning-options">
                {observedTrack.length > 0 && (
                  <details className="marine-layer-info marine-route-assessment">
                    <summary>{t("Avvisi della tratta")}</summary>
                    <p role="status">{trackAlertMessage}</p>
                    <p>
                      {t(
                        "Solo segmenti osservati nella vista corrente. Copertura parziale; i vuoti AIS non sono valutati.",
                      )}
                    </p>
                  </details>
                )}
                <label>
                  {t("Periodo")}
                  <select
                    value={days}
                    onChange={(event) => setDays(Number(event.target.value))}
                  >
                    {[7, 30, 90, 365].map((value) => (
                      <option key={value} value={value}>
                        {t("{count} giorni", { count: value })}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t("Tipo")}
                  <select
                    value={warningType}
                    onChange={(event) => setWarningType(event.target.value)}
                  >
                    {[
                      ["all", "Tutti"],
                      ["piracy", "Pirateria"],
                      ["attack", "Attacchi"],
                      ["incident", "Incidenti"],
                      ["restriction", "Interdizioni"],
                      ["navigation", "Pericoli alla navigazione"],
                    ].map(([value, label]) => (
                      <option key={value} value={value}>
                        {t(label)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="marine-layer-row">
                  <input
                    type="checkbox"
                    checked={activeOnly}
                    onChange={(event) => setActiveOnly(event.target.checked)}
                  />
                  {t("Solo avvisi attivi")}
                </label>
                <details className="marine-layer-info">
                  <summary>{t("Limiti e legenda")}</summary>
                  <p>
                    {t(
                      "Dati insufficienti per un rating globale. Gli avvisi attivi hanno precedenza sugli eventi storici.",
                    )}
                  </p>
                  <p className="marine-warning-legend">
                    <span style={{ color: "#e0a267" }}>●</span>{" "}
                    {t("Avviso attivo verificato")} ·{" "}
                    <span style={{ color: "#a7b5c3" }}>●</span>{" "}
                    {t("Storico o stato non verificato")} · ○{" "}
                    {t("Indicatore regionale approssimativo")}
                  </p>
                </details>
                {!!warnings?.metadata.unmappedCount && (
                  <p>
                    {t("{count} segnalazioni senza coordinate utilizzabili.", {
                      count: numbers(warnings.metadata.unmappedCount),
                    })}
                  </p>
                )}
                {!!warnings?.metadata.unmappedReports?.length && (
                  <details>
                    <summary>
                      {t("Eventi senza posizione cartografica")}
                    </summary>
                    {warnings.metadata.unmappedReports.map((report) => (
                      <div className="marine-source-status" key={report.id}>
                        <strong>{report.name}</strong>
                        <p>
                          {t(report.kind)} · {t(report.eventStatus)}
                        </p>
                        {report.occurredAt && (
                          <p>{sourceDate(report.occurredAt)}</p>
                        )}
                        {safeLink(report.sourceUrl) && (
                          <a
                            href={safeLink(report.sourceUrl)}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {report.source}
                          </a>
                        )}
                      </div>
                    ))}
                  </details>
                )}
              </div>
            )}
            {(enabled.includes("warnings") || enabled.includes("ports")) && (
              <details className="marine-layer-info">
                <summary>{t("Attribuzione e condizioni NGA")}</summary>
                <p lang="en">{NGA_DISCLAIMER}</p>
              </details>
            )}
            {(enabled.includes("waves") || enabled.includes("currents")) && (
              <label className="marine-forecast-time">
                {t("Previsione")}
                <select
                  value={forecastHours}
                  onChange={(event) =>
                    setForecastHours(Number(event.target.value))
                  }
                >
                  {[0, 3, 6, 12, 24].map((hours) => (
                    <option key={hours} value={hours}>
                      {hours === 0 ? t("Ora") : `+${hours} h`}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}
      </div>
      {enabled.includes("warnings") && observedTrack.length > 0 && (
        <div className="marine-track-alerts" role="status">
          {trackAlertMessage}
        </div>
      )}
      {selected && definition && (!isMobile || panel === "feature") && (
        <aside
          className={`marine-feature-panel${selected.layer === "ports" ? " marine-port-panel" : ""}`}
          aria-label={t("Dettaglio cartografico")}
        >
          <button
            className="close"
            aria-label={t("Chiudi scheda")}
            onClick={() => {
              setSelected(null);
              if (isMobile) closePanel();
            }}
          >
            ×
          </button>
          <p
            className="marine-feature-kind"
            style={{ color: definition.color }}
          >
            {t(definition.name)}
          </p>
          <h2>{t(text(properties?.name)) || t(definition.name)}</h2>
          {properties?.description && (
            <p className="marine-feature-description">
              {text(properties.description)}
            </p>
          )}
          {selected.layer === "ports" &&
            properties?.source === "NGA World Port Index" && (
              <PortTraffic portId={text(properties.id)} />
            )}
          <dl>
            {[
              ["Tipo", properties?.kind],
              ["Stato", properties?.status],
              ["Conferma", properties?.eventStatus],
              ["Precisione", properties?.precision],
              [
                "Paese",
                properties?.country ??
                  properties?.territory ??
                  properties?.wpi_cc ??
                  properties?.territory1,
              ],
              ["UN/LOCODE", properties?.unlocode],
              ["Profondità", properties?.depth],
              ["Stato del progetto", properties?.projectStatus],
              ["Regime della fonte", properties?.pol_type],
              ["Sovranità", properties?.sovereign1],
              ["Fonte", properties?.source],
              ["Licenza", properties?.license],
            ].map(([label, value]) =>
              text(value) ? (
                <div key={String(label)}>
                  <dt>{t(String(label))}</dt>
                  <dd>{t(text(value))}</dd>
                </div>
              ) : null,
            )}
            {(
              [
                ["Profondità canale", properties?.channel_depth],
                ["Profondità ancoraggio", properties?.anchorage_depth],
                ["Profondità banchina merci", properties?.cargo_pier_depth],
                [
                  "Profondità terminal petrolifero",
                  properties?.oil_terminal_depth,
                ],
                ["Profondità terminal GNL", properties?.lng_terminal_depth],
                ["Lunghezza massima nave", properties?.maxvessellength],
                ["Larghezza massima nave", properties?.maxvesselbeam],
                ["Pescaggio massimo nave", properties?.maxvesseldraft],
              ] as const
            ).map(([label, value]) =>
              typeof value === "number" &&
              Number.isFinite(value) &&
              value > 0 ? (
                <div key={label}>
                  <dt>{t(label)}</dt>
                  <dd>{measured(value)}</dd>
                </div>
              ) : null,
            )}
            {(
              [
                ["Pilotaggio disponibile", properties?.pilotage_avail],
                ["Pilotaggio obbligatorio", properties?.pilotage_compulsory],
                ["Assistenza rimorchiatori", properties?.tugs_assist],
                ["Ancoraggio disponibile", properties?.fac_anchor],
                ["Terminal container", properties?.fac_container],
                ["Terminal Ro-Ro", properties?.fac_roro],
                ["Separazione del traffico", properties?.tss],
                ["Servizio VTS", properties?.vts],
                [
                  "Carburante",
                  properties?.supply_fueloil ?? properties?.supplies_fuel,
                ],
                ["Acqua", properties?.supply_h2o ?? properties?.supplies_water],
                ["Riparazioni", properties?.repair_code ?? properties?.repairs],
                [
                  "Assistenza medica",
                  properties?.med_facilities ?? properties?.medical_facilities,
                ],
                ["Restrizioni di accesso", properties?.entry_restrictions],
              ] as const
            ).map(([label, value]) =>
              text(value) ? (
                <div key={label}>
                  <dt>{t(label)}</dt>
                  <dd>{t(text(value))}</dd>
                </div>
              ) : null,
            )}
            {properties?.reportedAt && (
              <div>
                <dt>{t("Data segnalazione")}</dt>
                <dd>{sourceDate(properties.reportedAt)}</dd>
              </div>
            )}
            {properties?.occurredAt && (
              <div>
                <dt>{t("Data evento")}</dt>
                <dd>{sourceDate(properties.occurredAt)}</dd>
              </div>
            )}
            {properties?.validFrom && (
              <div>
                <dt>{t("Valido dal")}</dt>
                <dd>{date(text(properties.validFrom))}</dd>
              </div>
            )}
            {properties?.validUntil && (
              <div>
                <dt>{t("Valido fino al")}</dt>
                <dd>{date(text(properties.validUntil))}</dd>
              </div>
            )}
            {properties?.updatedAt && (
              <div>
                <dt>
                  {t(
                    selected.layer === "warnings"
                      ? "Ultima consultazione"
                      : "Data della fonte",
                  )}
                </dt>
                <dd>{sourceDate(properties.updatedAt)}</dd>
              </div>
            )}
            {properties?.forecastAt && (
              <div>
                <dt>{t("Validità previsione")}</dt>
                <dd>{date(text(properties.forecastAt))}</dd>
              </div>
            )}
            {Number.isFinite(properties?.waveHeight) && (
              <div>
                <dt>{t("Altezza onde")}</dt>
                <dd>{numbers(Number(properties?.waveHeight))} m</dd>
              </div>
            )}
            {Number.isFinite(properties?.currentVelocity) && (
              <div>
                <dt>{t("Velocità corrente")}</dt>
                <dd>{numbers(Number(properties?.currentVelocity))} kn</dd>
              </div>
            )}
          </dl>
          {selected.layer === "ports" && (
            <p className="marine-panel-note">
              {t(
                "Profondità e servizi provengono dal catalogo portuale; verificare con l'autorità locale.",
              )}
            </p>
          )}
          {selected.layer === "ports" && properties?.displayPlacement && (
            <p className="marine-panel-note">
              {t(
                "Ancora sulla terraferma vicina; il tratto collega le coordinate originali NGA.",
              )}
            </p>
          )}
          {properties?.locationRole === "last_reported_vessel_position" && (
            <p className="notice">
              {t(
                "Ultima posizione pubblicata della nave; non identifica il luogo dell'attacco.",
              )}
            </p>
          )}
          {properties?.lastKnownInForce === true &&
            properties?.active !== true && (
              <p className="notice">
                {t(
                  "Avviso precedentemente in vigore: lo stato attuale non è verificato.",
                )}
              </p>
            )}
          {nearVessels && selected.layer !== "ports" && (
            <div className="marine-observed-stops">
              <h3>{t("Osservazioni AIS entro 5 km")}</h3>
              <p>
                {t(
                  "Conteggio delle navi caricate e visibili: dipende dalla vista, dai filtri e dalla copertura AIS.",
                )}
              </p>
              <p>
                {t(
                  "{total} navi recenti; {stopped} a velocità fino a 0,5 kn.",
                  {
                    total: numbers(nearVessels.total),
                    stopped: numbers(nearVessels.stopped),
                  },
                )}
              </p>
              <p>
                {t(
                  "Osservazioni degli ultimi 10 minuti. Non misura disponibilità degli ormeggi né congestione ufficiale.",
                )}
              </p>
            </div>
          )}
          {featureSource && (
            <a
              className="button"
              href={featureSource}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("Apri fonte")}
            </a>
          )}
        </aside>
      )}
    </>
  );
}

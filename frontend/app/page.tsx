"use client";
import { useLanguage } from "../components/LanguageProvider";
import dynamic from "next/dynamic";
import { useEffect, useState, useCallback, useRef } from "react";
import type { ShipType, VesselPosition } from "../../shared/types";
import SearchBar from "../components/SearchBar";
import VesselFilter from "../components/VesselFilter";
import TrackSummary from "../components/TrackSummary";
import type { TrackDisplayInfo } from "../lib/track-display";
import VesselDrawer from "../components/VesselDrawer";
import TrackTimeline from "../components/TrackTimeline";
import { MapSetting, useMapUI } from "../components/MapUIProvider";
const Map = dynamic(() => import("../components/Map"), {
  ssr: false,
  loading: MapLoading,
});
const ALL: ShipType[] = [
  "cargo",
  "tanker",
  "passenger",
  "fishing",
  "tug",
  "pleasure",
  "military",
  "other",
];
function MapLoading() {
  const { t } = useLanguage();
  return <p className="map-loading">{t("Caricamento mappa…")}</p>;
}
export default function Home() {
  const { t } = useLanguage();
  const {
    isMobile,
    menuOpen,
    panel,
    openMenu,
    closeMenu,
    openPanel,
    closePanel,
    setMenuTarget,
  } = useMapUI();
  const menuButton = useRef<HTMLButtonElement>(null);
  const menuClose = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!isMobile) return;
    const frame = requestAnimationFrame(() => {
      if (menuOpen) {
        menuClose.current?.focus();
        return;
      }
      if (panel) {
        const selectors = {
          vessel: ".vessel-sheet-heading button[aria-label]",
          track: ".mobile-track-sheet .mobile-sheet-heading button[aria-label]",
          layers: ".marine-panel-heading button",
          filters: ".vessel-filter-close",
          feature: ".marine-feature-panel .close",
          status: ".map-status .mobile-sheet-heading button",
        };
        document
          .querySelector<HTMLButtonElement>(selectors[panel])
          ?.focus({ preventScroll: true });
      } else if (
        document.activeElement !== document.getElementById("vessel-search")
      ) {
        menuButton.current?.focus({ preventScroll: true });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [isMobile, menuOpen, panel]);
  const [selected, setSelected] = useState<string | null>(null),
    [track, setTrack] = useState<string | null>(null),
    [days, setDays] = useState(7),
    [cursor, setCursor] = useState<{ key: string; at: number | null }>({
      key: "",
      at: null,
    }),
    [trackInfo, setTrackInfo] = useState<TrackDisplayInfo | null>(null),
    [showGapLinks, setShowGapLinks] = useState(false),
    [types, setTypes] = useState(new Set(ALL)),
    [counts, setCounts] = useState<Record<string, number>>({}),
    [globe, setGlobe] = useState(false),
    [focusMap, setFocusMap] = useState(true),
    [focusVersion, setFocusVersion] = useState(0),
    [center, setCenter] = useState<
      (VesselPosition & { preserveZoom?: boolean }) | null
    >(null);
  const trackKey = `${track}:${days}`;
  const playbackAt = cursor.key === trackKey ? cursor.at : null;
  const onPlayback = useCallback(
    (at: number | null) => setCursor({ key: trackKey, at }),
    [trackKey],
  );
  const currentTrackInfo =
    trackInfo?.mmsi === track && trackInfo.days === days ? trackInfo : null;
  const selectVessel = useCallback(
    (mmsi: string | null, focus: boolean) => {
      setFocusMap(focus);
      setSelected(mmsi);
      if (mmsi) openPanel("vessel");
      else closePanel();
      // Save the selected vessel on the map's history entry before opening a detail page.
      const url = new URL(window.location.href);
      if (mmsi) url.searchParams.set("vessel", mmsi);
      else url.searchParams.delete("vessel");
      window.history.replaceState(
        window.history.state,
        "",
        `${url.pathname}${url.search}${url.hash}`,
      );
    },
    [openPanel, closePanel],
  );
  const hideTrack = useCallback(() => {
    setTrack(null);
    setTrackInfo(null);
    setCursor({ key: "", at: null });
    if (selected) openPanel("vessel");
    else closePanel();
    // Direct links should also reflect that playback has been dismissed.
    const url = new URL(window.location.href);
    url.searchParams.delete("track");
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, [selected, openPanel, closePanel]);
  const toggleTrack = useCallback(
    (mmsi: string) => {
      if (track === mmsi) {
        hideTrack();
        return;
      }
      openPanel("track");
      setCursor({ key: "", at: null });
      setTrackInfo(null);
      setTrack(mmsi);
      const url = new URL(window.location.href);
      url.searchParams.set("track", mmsi);
      window.history.replaceState(
        window.history.state,
        "",
        `${url.pathname}${url.search}${url.hash}`,
      );
    },
    [track, hideTrack, openPanel],
  );
  const timeline =
    currentTrackInfo &&
    !currentTrackInfo.loading &&
    !currentTrackInfo.error &&
    currentTrackInfo.positions.length > 0 ? (
      <TrackTimeline
        key={trackKey}
        points={currentTrackInfo.positions}
        at={playbackAt}
        onChange={onPlayback}
        onLocate={(position) => setCenter({ ...position, preserveZoom: true })}
        compact={isMobile}
      />
    ) : null;
  const onPosition = useCallback(
    (p: VesselPosition | null) => {
      // Search and direct links locate vessels; map clicks keep the current view.
      if (focusMap) setCenter(p);
    },
    [focusMap, focusVersion],
  );
  useEffect(() => {
    const restoreSelection = () => {
      const q = new URLSearchParams(window.location.search),
        v = q.get("vessel"),
        trackMmsi = q.get("track");
      setFocusMap(true);
      // A cached map must locate the vessel again even if focus was already enabled.
      setFocusVersion((version) => version + 1);
      setSelected(v && /^[1-9]\d{8}$/.test(v) ? v : null);
      setTrack(trackMmsi && /^[1-9]\d{8}$/.test(trackMmsi) ? trackMmsi : null);
      if (v && /^[1-9]\d{8}$/.test(v)) openPanel("vessel");
      else if (trackMmsi && /^[1-9]\d{8}$/.test(trackMmsi)) openPanel("track");
      else closePanel();
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) restoreSelection();
    };
    restoreSelection();
    window.addEventListener("popstate", restoreSelection);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("popstate", restoreSelection);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [openPanel, closePanel]);
  const changeDays = (value: string) => {
    setCursor({ key: "", at: null });
    setTrackInfo(null);
    setDays(Number(value));
  };
  const periodOptions = [1, 7, 30, 90].map((d) => (
    <option key={d} value={d}>
      {t(d === 1 ? "{count} giorno" : "{count} giorni", { count: d })}
    </option>
  ));
  return (
    <main
      className="map-screen"
      data-mobile-panel={isMobile ? (panel ?? "none") : undefined}
      onPointerDown={(event) => {
        if (
          isMobile &&
          menuOpen &&
          event.target instanceof Element &&
          event.target.closest(".maplibregl-canvas")
        )
          closeMenu();
      }}
    >
      <Map
        onVesselClick={(mmsi) => selectVessel(mmsi, false)}
        trackMmsi={track}
        trackDays={days}
        visibleTypes={types}
        onTypeCounts={setCounts}
        isGlobe={globe}
        center={center}
        showGapLinks={showGapLinks}
        onTrackInfo={setTrackInfo}
        playbackAt={playbackAt}
      />
      <div className="brand">
        <strong>AIS Vessel Tracker</strong>
        <span>{t("Mediterraneo · beta")}</span>
      </div>
      <SearchBar
        onSelect={(v) => selectVessel(v.mmsi, true)}
        onFocus={() => {
          if (isMobile) {
            closeMenu();
            closePanel();
          }
        }}
      />
      <button
        className="mobile-menu-toggle"
        ref={menuButton}
        type="button"
        aria-label={t("Menu mappa")}
        aria-expanded={menuOpen}
        aria-controls="mobile-map-menu"
        onClick={() => (menuOpen ? closeMenu() : openMenu())}
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      <section
        className="mobile-map-menu"
        id="mobile-map-menu"
        hidden={!isMobile || !menuOpen}
        aria-labelledby="mobile-menu-heading"
      >
        <div className="mobile-sheet-heading">
          <h2 id="mobile-menu-heading">{t("Mappa")}</h2>
          <button
            ref={menuClose}
            type="button"
            aria-label={t("Chiudi menu")}
            onClick={() => {
              closeMenu();
              menuButton.current?.focus();
            }}
          >
            ×
          </button>
        </div>
        <div className="mobile-map-settings" ref={setMenuTarget} />
      </section>
      <VesselFilter
        visibleTypes={types}
        onFilterChange={setTypes}
        typeCounts={counts}
      />
      <MapSetting>
        <button
          className="globe-toggle"
          onClick={() => setGlobe((s) => !s)}
          aria-label={t("Cambia proiezione mappa")}
        >
          <span className="map-setting-label">{t("Proiezione")}</span>{" "}
          {globe ? "2D" : "3D"}
        </button>
      </MapSetting>
      {track && !isMobile && (
        <div className="track-controls">
          <label htmlFor="track-days">{t("Storico")}</label>
          <select
            id="track-days"
            value={days}
            onChange={(e) => changeDays(e.target.value)}
          >
            {periodOptions}
          </select>
          <button onClick={hideTrack} aria-label={t("Nascondi traccia")}>
            ×
          </button>
        </div>
      )}
      {track && !isMobile && track !== selected && timeline && (
        <div className="track-timeline-floating">
          <p className="small muted">MMSI {track}</p>
          {timeline}
        </div>
      )}
      {selected && (
        <VesselDrawer
          mmsi={selected}
          onClose={() => selectVessel(null, false)}
          onShowTrack={toggleTrack}
          trackVisible={track === selected}
          onPosition={onPosition}
          hidden={isMobile && panel !== "vessel"}
          compact={isMobile}
          onCollapse={closePanel}
        >
          {!isMobile && track === selected && (
            <TrackSummary
              info={currentTrackInfo}
              showLinks={showGapLinks}
              onShowLinks={setShowGapLinks}
            >
              {timeline}
            </TrackSummary>
          )}
        </VesselDrawer>
      )}
      {isMobile && track && panel === "track" && (
        <section className="mobile-track-sheet" aria-label={t("Traccia")}>
          <div className="mobile-sheet-heading">
            <h2>
              {t("Traccia")} <span>{track}</span>
            </h2>
            {selected && (
              <button type="button" onClick={() => openPanel("vessel")}>
                {t("Nave")}
              </button>
            )}
            <button
              type="button"
              onClick={closePanel}
              aria-label={t("Riduci traccia")}
            >
              ⌄
            </button>
          </div>
          <div className="mobile-track-period">
            <label htmlFor="track-days">{t("Storico")}</label>
            <select
              id="track-days"
              value={days}
              onChange={(event) => changeDays(event.target.value)}
            >
              {periodOptions}
            </select>
            <button type="button" onClick={hideTrack}>
              {t("Nascondi traccia")}
            </button>
          </div>
          <TrackSummary
            info={currentTrackInfo}
            showLinks={showGapLinks}
            onShowLinks={setShowGapLinks}
            compact
          >
            {timeline}
          </TrackSummary>
        </section>
      )}
      {isMobile && !menuOpen && !panel && (selected || track) && (
        <nav className="mobile-map-dock" aria-label={t("Pannelli mappa")}>
          {selected && (
            <button type="button" onClick={() => openPanel("vessel")}>
              {t("Nave")}
            </button>
          )}
          {track && (
            <button type="button" onClick={() => openPanel("track")}>
              {t("Traccia")}
            </button>
          )}
        </nav>
      )}
    </main>
  );
}

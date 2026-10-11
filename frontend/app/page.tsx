"use client";
import { useLanguage } from "../components/LanguageProvider";
import dynamic from "next/dynamic";
import { useEffect, useState, useCallback } from "react";
import type { ShipType, VesselPosition } from "../../shared/types";
import SearchBar from "../components/SearchBar";
import VesselFilter from "../components/VesselFilter";
import TrackSummary from "../components/TrackSummary";
import type { TrackDisplayInfo } from "../lib/track-display";
import VesselDrawer from "../components/VesselDrawer";
import TrackTimeline from "../components/TrackTimeline";
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
  const selectVessel = useCallback((mmsi: string | null, focus: boolean) => {
    setFocusMap(focus);
    setSelected(mmsi);
    // Save the selected vessel on the map's history entry before opening a detail page.
    const url = new URL(window.location.href);
    if (mmsi) url.searchParams.set("vessel", mmsi);
    else url.searchParams.delete("vessel");
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, []);
  const hideTrack = useCallback(() => {
    setTrack(null);
    setTrackInfo(null);
    setCursor({ key: "", at: null });
    // Direct links should also reflect that playback has been dismissed.
    const url = new URL(window.location.href);
    url.searchParams.delete("track");
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, []);
  const toggleTrack = useCallback(
    (mmsi: string) => {
      if (track === mmsi) {
        hideTrack();
        return;
      }
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
    [track, hideTrack],
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
      />
    ) : null;
  const onPosition = useCallback(
    (p: VesselPosition | null) => {
      // Search and direct links locate vessels; map clicks keep the current view.
      if (focusMap) setCenter(p);
    },
    [focusMap],
  );
  useEffect(() => {
    const restoreSelection = () => {
      const q = new URLSearchParams(window.location.search),
        v = q.get("vessel"),
        trackMmsi = q.get("track");
      setFocusMap(true);
      setSelected(v && /^[1-9]\d{8}$/.test(v) ? v : null);
      setTrack(trackMmsi && /^[1-9]\d{8}$/.test(trackMmsi) ? trackMmsi : null);
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
  }, []);
  return (
    <main className="map-screen">
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
      <SearchBar onSelect={(v) => selectVessel(v.mmsi, true)} />
      <VesselFilter
        visibleTypes={types}
        onFilterChange={setTypes}
        typeCounts={counts}
      />
      <button
        className="globe-toggle"
        onClick={() => setGlobe((s) => !s)}
        aria-label={t("Cambia proiezione mappa")}
      >
        {globe ? "2D" : "3D"}
      </button>
      {track && (
        <div className="track-controls">
          <label htmlFor="track-days">{t("Storico")}</label>
          <select
            id="track-days"
            value={days}
            onChange={(e) => {
              setCursor({ key: "", at: null });
              setTrackInfo(null);
              setDays(Number(e.target.value));
            }}
          >
            {[1, 7, 30, 90].map((d) => (
              <option key={d} value={d}>
                {t(d === 1 ? "{count} giorno" : "{count} giorni", { count: d })}
              </option>
            ))}
          </select>
          <button onClick={hideTrack} aria-label={t("Nascondi traccia")}>
            ×
          </button>
        </div>
      )}
      {track && track !== selected && timeline && (
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
        >
          {track === selected && (
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
    </main>
  );
}

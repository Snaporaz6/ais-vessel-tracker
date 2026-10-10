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
    [trackInfo, setTrackInfo] = useState<TrackDisplayInfo | null>(null),
    [showGapLinks, setShowGapLinks] = useState(false),
    [types, setTypes] = useState(new Set(ALL)),
    [counts, setCounts] = useState<Record<string, number>>({}),
    [globe, setGlobe] = useState(false),
    [focusMap, setFocusMap] = useState(true),
    [center, setCenter] = useState<VesselPosition | null>(null);
  const onPosition = useCallback(
    (p: VesselPosition | null) => {
      // Search and direct links locate vessels; map clicks keep the current view.
      if (focusMap) setCenter(p);
    },
    [focusMap],
  );
  useEffect(() => {
    const q = new URLSearchParams(window.location.search),
      v = q.get("vessel"),
      t = q.get("track");
    if (v && /^[1-9]\d{8}$/.test(v)) setSelected(v);
    if (t && /^[1-9]\d{8}$/.test(t)) setTrack(t);
  }, []);
  return (
    <main className="map-screen">
      <Map
        onVesselClick={(mmsi) => {
          setFocusMap(false);
          setSelected(mmsi);
        }}
        trackMmsi={track}
        trackDays={days}
        visibleTypes={types}
        onTypeCounts={setCounts}
        isGlobe={globe}
        center={center}
        showGapLinks={showGapLinks}
        onTrackInfo={setTrackInfo}
      />
      <div className="brand">
        <strong>AIS Vessel Tracker</strong>
        <span>{t("Mediterraneo · beta")}</span>
      </div>
      <SearchBar
        onSelect={(v) => {
          setFocusMap(true);
          setSelected(v.mmsi);
        }}
      />
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
            onChange={(e) => setDays(Number(e.target.value))}
          >
            {[1, 7, 30, 90].map((d) => (
              <option key={d} value={d}>
                {t(d === 1 ? "{count} giorno" : "{count} giorni", { count: d })}
              </option>
            ))}
          </select>
          <button
            onClick={() => setTrack(null)}
            aria-label={t("Nascondi traccia")}
          >
            ×
          </button>
        </div>
      )}
      {selected && (
        <VesselDrawer
          mmsi={selected}
          onClose={() => setSelected(null)}
          onShowTrack={setTrack}
          onPosition={onPosition}
        >
          {track === selected && (
            <TrackSummary
              info={
                trackInfo?.mmsi === track && trackInfo.days === days
                  ? trackInfo
                  : null
              }
              showLinks={showGapLinks}
              onShowLinks={setShowGapLinks}
            />
          )}
        </VesselDrawer>
      )}
    </main>
  );
}

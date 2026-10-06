"use client";
import dynamic from "next/dynamic";
import { useEffect, useState, useCallback } from "react";
import type { ShipType, VesselPosition } from "../../shared/types";
import SearchBar from "../components/SearchBar";
import VesselFilter from "../components/VesselFilter";
import VesselDrawer from "../components/VesselDrawer";
const Map = dynamic(() => import("../components/Map"), {
  ssr: false,
  loading: () => <p className="map-loading">Caricamento mappa…</p>,
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
export default function Home() {
  const [selected, setSelected] = useState<string | null>(null),
    [track, setTrack] = useState<string | null>(null),
    [days, setDays] = useState(7),
    [types, setTypes] = useState(new Set(ALL)),
    [counts, setCounts] = useState<Record<string, number>>({}),
    [globe, setGlobe] = useState(false),
    [center, setCenter] = useState<VesselPosition | null>(null);
  const onPosition = useCallback(
    (p: VesselPosition | null) => setCenter(p),
    [],
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
        onVesselClick={setSelected}
        trackMmsi={track}
        trackDays={days}
        visibleTypes={types}
        onTypeCounts={setCounts}
        isGlobe={globe}
        center={center}
      />
      <div className="brand">
        <strong>AIS Vessel Tracker</strong>
        <span>Mediterraneo · beta</span>
      </div>
      <SearchBar onSelect={(v) => setSelected(v.mmsi)} />
      <VesselFilter
        visibleTypes={types}
        onFilterChange={setTypes}
        typeCounts={counts}
      />
      <button
        className="globe-toggle"
        onClick={() => setGlobe((s) => !s)}
        aria-label="Cambia proiezione mappa"
      >
        {globe ? "2D" : "3D"}
      </button>
      {track && (
        <div className="track-controls">
          <label htmlFor="track-days">Storico</label>
          <select
            id="track-days"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            {[1, 7, 30, 90].map((d) => (
              <option key={d} value={d}>
                {d} {d === 1 ? "giorno" : "giorni"}
              </option>
            ))}
          </select>
          <button onClick={() => setTrack(null)} aria-label="Nascondi traccia">
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
        />
      )}
    </main>
  );
}

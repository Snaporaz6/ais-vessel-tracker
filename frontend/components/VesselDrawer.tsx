"use client";
import { useEffect, useState } from "react";
import type {
  VesselDetail,
  PortCall,
  VesselPosition,
} from "../../shared/types";
import { getVessel, getPortCalls } from "../lib/api";
import VesselView from "./VesselView";
export default function VesselDrawer({
  mmsi,
  onClose,
  onShowTrack,
  onPosition,
}: {
  mmsi: string;
  onClose: () => void;
  onShowTrack: (m: string) => void;
  onPosition: (p: VesselPosition | null) => void;
}) {
  const [vessel, setVessel] = useState<VesselDetail | null>(null),
    [stops, setStops] = useState<PortCall[]>([]),
    [error, setError] = useState(""),
    [stopsError, setStopsError] = useState("");
  useEffect(() => {
    let c: AbortController | undefined;
    let stopped = false;
    let centered = false;
    setVessel(null);
    setStops([]);
    setError("");
    setStopsError("");
    const load = () => {
      if (document.visibilityState === "hidden" || stopped) return;
      c?.abort();
      c = new AbortController();
      const signal = c.signal;
      getVessel(mmsi, signal)
        .then((v) => {
          if (!signal.aborted && !stopped) {
            setVessel(v);
            setError("");
            if (!centered && v.last_position) {
              onPosition(v.last_position);
              centered = true;
            }
          }
        })
        .catch((e) => {
          if (!signal.aborted && !stopped) setError(e.message);
        });
      getPortCalls(mmsi, signal)
        .then((s) => {
          if (!signal.aborted && !stopped) {
            setStops(s);
            setStopsError("");
          }
        })
        .catch((e) => {
          if (!signal.aborted && !stopped) setStopsError(e.message);
        });
    };
    load();
    const timer = setInterval(load, 15_000);
    document.addEventListener("visibilitychange", load);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
      c?.abort();
    };
  }, [mmsi, onPosition]);
  return (
    <aside className="vessel-drawer" aria-label="Scheda nave">
      <button className="close" onClick={onClose} aria-label="Chiudi scheda">
        ×
      </button>
      {error ? (
        <p role="alert">{error}</p>
      ) : vessel ? (
        <VesselView
          vessel={vessel}
          stops={stops}
          stopsError={stopsError}
          onShowTrack={() => onShowTrack(mmsi)}
        />
      ) : (
        <p role="status">Caricamento scheda…</p>
      )}
    </aside>
  );
}

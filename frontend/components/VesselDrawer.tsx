"use client";
import { useLanguage } from "./LanguageProvider";
import { useCallback, useEffect, useState, type ReactNode } from "react";
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
  children,
  trackVisible,
  hidden = false,
  compact = false,
  onCollapse,
}: {
  children?: ReactNode;
  trackVisible: boolean;
  hidden?: boolean;
  compact?: boolean;
  onCollapse?: () => void;
  mmsi: string;
  onClose: () => void;
  onShowTrack: (m: string) => void;
  onPosition: (p: VesselPosition | null, locate: boolean) => void;
}) {
  const { t, errorText } = useLanguage();
  const [vessel, setVessel] = useState<VesselDetail | null>(null),
    [stops, setStops] = useState<PortCall[]>([]),
    [error, setError] = useState(""),
    [stopsError, setStopsError] = useState("");
  const toggleTrack = useCallback(() => onShowTrack(mmsi), [onShowTrack, mmsi]);
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
            // Refresh the selected fix without re-centering every fifteen seconds.
            onPosition(v.last_position, !centered && !!v.last_position);
            if (v.last_position) centered = true;
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
    <aside
      className="vessel-drawer"
      aria-label={t("Scheda nave")}
      hidden={hidden}
    >
      {compact && (
        <div className="mobile-sheet-heading vessel-sheet-heading">
          <h2>{vessel?.name ?? mmsi}</h2>
          <button
            type="button"
            onClick={onCollapse}
            aria-label={t("Riduci scheda")}
          >
            ⌄
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("Chiudi scheda")}
          >
            ×
          </button>
        </div>
      )}
      <button
        className="close"
        onClick={onClose}
        aria-label={t("Chiudi scheda")}
        hidden={compact}
      >
        ×
      </button>
      {error ? (
        <p role="alert">{errorText(error)}</p>
      ) : vessel ? (
        <VesselView
          vessel={vessel}
          stops={stops}
          stopsError={stopsError}
          onShowTrack={toggleTrack}
          trackVisible={trackVisible}
          trackPanel={children}
          compact={compact}
        />
      ) : (
        <p role="status">{t("Caricamento scheda…")}</p>
      )}
    </aside>
  );
}

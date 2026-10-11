"use client";
import { useEffect, useState } from "react";
import type { Map } from "maplibre-gl";
import { applyMapTheme, type MapTheme } from "../lib/map-theme";
import { useLanguage } from "./LanguageProvider";
export default function MapStyleSelector({ map }: { map: Map }) {
  const { t } = useLanguage();
  const [theme, setTheme] = useState<MapTheme>("dark");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("ais-map-theme-v1");
      if (saved === "light" || saved === "ecdis") setTheme(saved);
    } catch {}
  }, []);
  useEffect(() => {
    document.documentElement.dataset.mapTheme = theme;
    let frame = 0;
    const apply = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => applyMapTheme(map, theme));
    };
    apply();
    map.on("styledata", apply);
    return () => {
      cancelAnimationFrame(frame);
      map.off("styledata", apply);
    };
  }, [map, theme]);
  return (
    <label
      className="map-style-selector"
      title={
        theme === "ecdis"
          ? t(
              "Stile illustrativo, non una carta ECDIS certificata. Fondali generalizzati alle scale panoramiche.",
            )
          : undefined
      }
    >
      <span>{t("Stile mappa")}</span>
      <select
        aria-label={t("Stile mappa")}
        value={theme}
        onChange={(event) => {
          const next = event.target.value as MapTheme;
          setTheme(next);
          try {
            localStorage.setItem("ais-map-theme-v1", next);
          } catch {}
        }}
      >
        <option value="dark">Dark</option>
        <option value="light">Light</option>
        <option value="ecdis">{t("ECDIS ispirato")}</option>
      </select>
    </label>
  );
}

"use client";
import { useEffect } from "react";
import type { Map } from "maplibre-gl";
import { applyMapTheme, type MapTheme } from "../lib/map-theme";
import { useLanguage } from "./LanguageProvider";
import { useTheme } from "./ThemeProvider";
export default function MapStyleSelector({ map }: { map: Map }) {
  const { t } = useLanguage();
  const { theme, select } = useTheme();
  useEffect(() => {
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
          select(next);
        }}
      >
        <option value="dark">Dark</option>
        <option value="light">Light</option>
        <option value="ecdis">{t("ECDIS ispirato")}</option>
      </select>
    </label>
  );
}

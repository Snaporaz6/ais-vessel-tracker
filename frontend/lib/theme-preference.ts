import type { MapTheme } from "./map-theme";

export const THEME_STORAGE = "ais-map-theme-v1";
export const THEME_COOKIE = "ais-map-theme";
export function isMapTheme(value: unknown): value is MapTheme {
  return value === "dark" || value === "light" || value === "ecdis";
}

// Runs before paint, including direct detail-page visits. Migrates older
// localStorage-only preferences without importing the map into the layout.
export const themeBootstrap = `(() => {try {
  const cookie = document.cookie.match(/(?:^|;\\s*)ais-map-theme=(dark|light|ecdis)(?:;|$)/);
  const saved = cookie ? cookie[1] : localStorage.getItem("ais-map-theme-v1");
  if (saved === "dark" || saved === "light" || saved === "ecdis") {
    document.documentElement.dataset.mapTheme = saved;
  }
} catch {}})();`;

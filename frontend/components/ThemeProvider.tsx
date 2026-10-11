"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { MapTheme } from "../lib/map-theme";
import {
  isMapTheme,
  THEME_COOKIE,
  THEME_STORAGE,
} from "../lib/theme-preference";

const Context = createContext<{
  theme: MapTheme;
  select: (theme: MapTheme) => void;
} | null>(null);

function applyPreference(theme: MapTheme) {
  document.documentElement.dataset.mapTheme = theme;
  document.cookie = `${THEME_COOKIE}=${theme}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
}

export default function ThemeProvider({
  initial,
  children,
}: {
  initial: MapTheme;
  children: React.ReactNode;
}) {
  const [theme, setTheme] = useState(initial);
  useEffect(() => {
    const painted = document.documentElement.dataset.mapTheme;
    const next = isMapTheme(painted) ? painted : initial;
    applyPreference(next);
    setTheme(next);
    const sync = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE) return;
      const value = isMapTheme(event.newValue) ? event.newValue : "dark";
      applyPreference(value);
      setTheme(value);
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [initial]);
  function select(next: MapTheme) {
    if (!isMapTheme(next)) return;
    applyPreference(next);
    setTheme(next);
    try {
      localStorage.setItem(THEME_STORAGE, next);
    } catch {}
  }
  return (
    <Context.Provider value={{ theme, select }}>{children}</Context.Provider>
  );
}

export function useTheme() {
  const context = useContext(Context);
  if (!context) throw new Error("ThemeProvider missing");
  return context;
}

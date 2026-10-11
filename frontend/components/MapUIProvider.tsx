"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";

export type MobilePanel =
  "vessel" | "track" | "feature" | "layers" | "filters" | "status";

type MapUI = {
  isMobile: boolean;
  menuOpen: boolean;
  panel: MobilePanel | null;
  openMenu: () => void;
  closeMenu: () => void;
  openPanel: (panel: MobilePanel) => void;
  closePanel: () => void;
  menuTarget: HTMLElement | null;
  setMenuTarget: (target: HTMLElement | null) => void;
};

const Context = createContext<MapUI | null>(null);

export default function MapUIProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [smallScreen, setSmallScreen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [panel, setPanel] = useState<MobilePanel | null>(null);
  const [menuTarget, setMenuTarget] = useState<HTMLElement | null>(null);
  const isMobile = smallScreen && pathname === "/";
  useEffect(() => {
    const media = window.matchMedia("(max-width: 900px)");
    const update = () => setSmallScreen(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const openMenu = useCallback(() => {
    setPanel(null);
    setMenuOpen(true);
  }, []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const openPanel = useCallback((next: MobilePanel) => {
    setMenuOpen(false);
    setPanel(next);
  }, []);
  const closePanel = useCallback(() => setPanel(null), []);
  useEffect(() => {
    if (!isMobile) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      setPanel(null);
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [isMobile]);
  const value = useMemo(
    () => ({
      isMobile,
      menuOpen,
      panel,
      openMenu,
      closeMenu,
      openPanel,
      closePanel,
      menuTarget,
      setMenuTarget,
    }),
    [
      isMobile,
      menuOpen,
      panel,
      openMenu,
      closeMenu,
      openPanel,
      closePanel,
      menuTarget,
    ],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useMapUI() {
  const value = useContext(Context);
  if (!value) throw new Error("MapUIProvider missing");
  return value;
}

/** Keep one instance of each control, including its state, in both layouts. */
export function MapSetting({ children }: { children: ReactNode }) {
  const { isMobile, menuTarget } = useMapUI();
  if (!isMobile) return children;
  return menuTarget ? createPortal(children, menuTarget) : null;
}

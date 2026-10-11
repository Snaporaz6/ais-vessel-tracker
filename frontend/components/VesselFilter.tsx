"use client";
import { useLanguage } from "./LanguageProvider";
import { MapSetting, useMapUI } from "./MapUIProvider";

import { useState } from "react";
import type { ShipType } from "../../shared/types";

/** Colori per tipo nave — coerenti con Map.tsx */
const VESSEL_TYPE_CONFIG: { type: ShipType; label: string; color: string }[] = [
  { type: "cargo", label: "Cargo", color: "#22c55e" },
  { type: "tanker", label: "Petroliere", color: "#f59e0b" },
  { type: "passenger", label: "Passeggeri", color: "#3b82f6" },
  { type: "fishing", label: "Pesca", color: "#06b6d4" },
  { type: "tug", label: "Rimorchiatori", color: "#8b5cf6" },
  { type: "pleasure", label: "Diporto", color: "#ec4899" },
  { type: "military", label: "Militari", color: "#6b7280" },
  { type: "other", label: "Altro", color: "#9ca3af" },
];

const ALL_TYPES = new Set<ShipType>(VESSEL_TYPE_CONFIG.map((c) => c.type));

interface VesselFilterProps {
  visibleTypes: Set<ShipType>;
  onFilterChange: (types: Set<ShipType>) => void;
  /** Conteggio navi per tipo (opzionale, per mostrare i numeri) */
  typeCounts?: Record<string, number>;
}

/** Menu a scomparsa per filtrare le navi per tipologia */
export default function VesselFilter({
  visibleTypes,
  onFilterChange,
  typeCounts,
}: VesselFilterProps) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const { isMobile, panel, openPanel, closePanel } = useMapUI();
  const expanded = isMobile ? panel === "filters" : open;
  const close = () => (isMobile ? closePanel() : setOpen(false));
  const toggle = () => {
    if (isMobile) {
      if (expanded) closePanel();
      else openPanel("filters");
    } else setOpen((previous) => !previous);
  };

  const allSelected = visibleTypes.size === ALL_TYPES.size;
  const noneSelected = visibleTypes.size === 0;

  const toggleType = (type: ShipType) => {
    const next = new Set(visibleTypes);
    if (next.has(type)) {
      next.delete(type);
    } else {
      next.add(type);
    }
    onFilterChange(next);
  };

  const selectAll = () => onFilterChange(new Set(ALL_TYPES));
  const deselectAll = () => onFilterChange(new Set());

  return (
    <>
      <MapSetting>
        <button
          type="button"
          onClick={toggle}
          className="vessel-filter-toggle"
          title={t("Filtra tipologie navi")}
          aria-label={t("Filtra tipologie navi")}
          aria-expanded={expanded}
          aria-controls="vessel-filters"
        >
          <svg
            aria-hidden="true"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
          <span className="map-setting-label">{t("Filtra navi")}</span>
          {!allSelected && !noneSelected && (
            <span className="vessel-filter-badge">{visibleTypes.size}</span>
          )}
        </button>
      </MapSetting>
      {expanded && (
        <section
          className="vessel-filter-panel"
          id="vessel-filters"
          aria-label={t("Filtra navi")}
        >
          <div className="vessel-filter-header">
            <strong>{t("Filtra navi")}</strong>
            <button
              type="button"
              onClick={close}
              className="vessel-filter-close"
              aria-label={t("Chiudi filtri")}
            >
              <svg
                aria-hidden="true"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <path d="m18 6-12 12M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="vessel-filter-actions">
            <button type="button" onClick={selectAll} disabled={allSelected}>
              {t("Tutti")}
            </button>
            <button type="button" onClick={deselectAll} disabled={noneSelected}>
              {t("Nessuno")}
            </button>
          </div>
          <div className="vessel-filter-list">
            {VESSEL_TYPE_CONFIG.map(({ type, label, color }) => {
              const checked = visibleTypes.has(type);
              const count = typeCounts?.[type] ?? 0;
              return (
                <label
                  key={type}
                  className={`vessel-filter-row${checked ? " is-selected" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleType(type)}
                    style={{ accentColor: color }}
                  />
                  <span
                    aria-hidden="true"
                    className="vessel-filter-color"
                    style={{ backgroundColor: color }}
                  />
                  <span className="vessel-filter-label">{t(label)}</span>
                  {count > 0 && (
                    <span className="vessel-filter-count">{count}</span>
                  )}
                </label>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}

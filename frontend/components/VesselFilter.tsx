'use client';

import { useState } from 'react';
import type { ShipType } from '../../shared/types';

/** Colori per tipo nave — coerenti con Map.tsx */
const VESSEL_TYPE_CONFIG: { type: ShipType; label: string; color: string }[] = [
  { type: 'cargo',     label: 'Cargo',       color: '#22c55e' },
  { type: 'tanker',    label: 'Tanker',      color: '#f59e0b' },
  { type: 'passenger', label: 'Passeggeri',  color: '#3b82f6' },
  { type: 'fishing',   label: 'Pesca',       color: '#06b6d4' },
  { type: 'tug',       label: 'Rimorchiatori', color: '#8b5cf6' },
  { type: 'pleasure',  label: 'Diporto',     color: '#ec4899' },
  { type: 'military',  label: 'Militari',    color: '#6b7280' },
  { type: 'other',     label: 'Altro',       color: '#9ca3af' },
];

const ALL_TYPES = new Set<ShipType>(VESSEL_TYPE_CONFIG.map((c) => c.type));

interface VesselFilterProps {
  visibleTypes: Set<ShipType>;
  onFilterChange: (types: Set<ShipType>) => void;
  /** Conteggio navi per tipo (opzionale, per mostrare i numeri) */
  typeCounts?: Record<string, number>;
}

/** Menu a scomparsa per filtrare le navi per tipologia */
export default function VesselFilter({ visibleTypes, onFilterChange, typeCounts }: VesselFilterProps) {
  const [open, setOpen] = useState(false);

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
      {/* Bottone toggle — sempre visibile */}
      <button
        onClick={() => setOpen((prev) => !prev)}
        style={toggleButtonStyle}
        title="Filtra tipologie navi"
        aria-label="Filtra tipologie navi"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
        </svg>
        {!allSelected && !noneSelected && (
          <span style={badgeStyle}>{visibleTypes.size}</span>
        )}
      </button>

      {/* Pannello filtri — a scomparsa */}
      {open && (
        <div style={panelStyle}>
          <div style={headerStyle}>
            <span style={{ fontWeight: 700, fontSize: 13, color: '#f3f4f6' }}>Filtra navi</span>
            <button onClick={() => setOpen(false)} style={closeButtonStyle} aria-label="Chiudi filtri">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Azioni rapide */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <button
              onClick={selectAll}
              disabled={allSelected}
              style={quickActionStyle(allSelected)}
            >
              Tutti
            </button>
            <button
              onClick={deselectAll}
              disabled={noneSelected}
              style={quickActionStyle(noneSelected)}
            >
              Nessuno
            </button>
          </div>

          {/* Checkbox per ogni tipo */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {VESSEL_TYPE_CONFIG.map(({ type, label, color }) => {
              const checked = visibleTypes.has(type);
              const count = typeCounts?.[type] ?? 0;

              return (
                <label
                  key={type}
                  style={checkboxRowStyle(checked)}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleType(type)}
                    style={{ display: 'none' }}
                  />
                  {/* Checkbox custom */}
                  <span style={checkboxStyle(checked, color)}>
                    {checked && (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </span>

                  {/* Indicatore colore */}
                  <span style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: color,
                    flexShrink: 0,
                    boxShadow: `0 0 4px ${color}60`,
                  }} />

                  <span style={{ flex: 1, fontSize: 12, color: checked ? '#e5e7eb' : '#6b7280' }}>
                    {label}
                  </span>

                  {count > 0 && (
                    <span style={{ fontSize: 10, color: '#6b7280', fontVariantNumeric: 'tabular-nums' }}>
                      {count}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

// ─── Stili ──────────────────────────────────────────────────────────────────────

const toggleButtonStyle: React.CSSProperties = {
  position: 'absolute',
  top: 80,
  left: 16,
  zIndex: 1000,
  width: 38,
  height: 38,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(17, 24, 39, 0.92)',
  backdropFilter: 'blur(4px)',
  border: '1px solid #374151',
  borderRadius: 8,
  color: '#d1d5db',
  cursor: 'pointer',
  padding: 0,
};

const badgeStyle: React.CSSProperties = {
  position: 'absolute',
  top: -4,
  right: -4,
  width: 16,
  height: 16,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#3b82f6',
  borderRadius: '50%',
  fontSize: 9,
  fontWeight: 700,
  color: '#fff',
};

const panelStyle: React.CSSProperties = {
  position: 'absolute',
  top: 80,
  left: 62,
  zIndex: 1000,
  width: 200,
  background: 'rgba(17, 24, 39, 0.95)',
  backdropFilter: 'blur(8px)',
  border: '1px solid #374151',
  borderRadius: 10,
  padding: '10px 12px',
  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 10,
  paddingBottom: 8,
  borderBottom: '1px solid #374151',
};

const closeButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#6b7280',
  cursor: 'pointer',
  padding: 2,
  display: 'flex',
  alignItems: 'center',
};

function quickActionStyle(disabled: boolean): React.CSSProperties {
  return {
    flex: 1,
    padding: '4px 8px',
    fontSize: 11,
    fontWeight: 600,
    color: disabled ? '#4b5563' : '#d1d5db',
    background: disabled ? 'transparent' : '#1f2937',
    border: `1px solid ${disabled ? '#374151' : '#4b5563'}`,
    borderRadius: 5,
    cursor: disabled ? 'default' : 'pointer',
  };
}

function checkboxRowStyle(checked: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '5px 6px',
    borderRadius: 6,
    cursor: 'pointer',
    transition: 'background 0.15s',
    background: checked ? 'rgba(255,255,255,0.03)' : 'transparent',
  };
}

function checkboxStyle(checked: boolean, color: string): React.CSSProperties {
  return {
    width: 16,
    height: 16,
    borderRadius: 4,
    border: `1.5px solid ${checked ? color : '#4b5563'}`,
    background: checked ? color : 'transparent',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    transition: 'all 0.15s',
  };
}

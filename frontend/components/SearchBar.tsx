'use client';

import { useState, useCallback } from 'react';
import type { Vessel } from '../../shared/types';

interface SearchBarProps {
  onSelect: (vessel: Vessel) => void;
}

export default function SearchBar({ onSelect }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Vessel[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data = await res.json() as Vessel[];
      setResults(data);
      setOpen(true);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInput = (value: string) => {
    setQuery(value);
    const timeout = setTimeout(() => search(value), 300);
    return () => clearTimeout(timeout);
  };

  return (
    <div style={{
      position: 'absolute',
      top: 16,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 1000,
      width: '100%',
      maxWidth: 480,
      padding: '0 16px',
    }}>
      <input
        type="text"
        value={query}
        onChange={(e) => handleInput(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder="Search vessel by name, MMSI, or IMO..."
        style={{
          width: '100%',
          padding: '12px 16px',
          borderRadius: 8,
          border: '1px solid var(--border)',
          background: 'var(--bg-card)',
          color: 'var(--text-primary)',
          fontSize: 14,
          outline: 'none',
        }}
      />
      {loading && (
        <div style={{ position: 'absolute', right: 28, top: 12, color: 'var(--text-secondary)', fontSize: 12 }}>
          Loading...
        </div>
      )}
      {open && results.length > 0 && (
        <ul style={{
          listStyle: 'none',
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          marginTop: 4,
          maxHeight: 300,
          overflowY: 'auto',
        }}>
          {results.map((v) => (
            <li
              key={v.mmsi}
              onClick={() => {
                onSelect(v);
                setOpen(false);
                setQuery(v.name);
              }}
              style={{
                padding: '10px 16px',
                cursor: 'pointer',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                justifyContent: 'space-between',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-secondary)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <span>{v.name}</span>
              <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                {v.mmsi} | {v.ship_type} | {v.flag}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

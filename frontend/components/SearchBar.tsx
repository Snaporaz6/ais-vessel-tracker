"use client";
import { useLanguage } from "./LanguageProvider";
import { useEffect, useRef, useState } from "react";
import { searchVessels } from "../lib/api";
import type { Vessel } from "../../shared/types";
export default function SearchBar({
  onSelect,
}: {
  onSelect: (v: Vessel) => void;
}) {
  const { t, shipNames, errorText } = useLanguage();
  const [query, setQuery] = useState(""),
    [results, setResults] = useState<Vessel[]>([]),
    [status, setStatus] = useState(""),
    [open, setOpen] = useState(false);
  const selection = useRef(false);
  useEffect(() => {
    if (selection.current) {
      selection.current = false;
      return;
    }
    const controller = new AbortController();
    setResults([]);
    setStatus("");
    if (query.trim().length < 2) {
      setOpen(false);
      return () => controller.abort();
    }
    const timer = setTimeout(() => {
      setStatus(t("Ricerca in corso…"));
      setOpen(true);
      searchVessels(query.trim(), controller.signal)
        .then((rows) => {
          if (!controller.signal.aborted) {
            setResults(rows);
            setStatus(rows.length ? "" : "Nessuna nave trovata.");
          }
        })
        .catch((e) => {
          if (!controller.signal.aborted) setStatus(e.message);
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);
  return (
    <div className="search-panel">
      <label className="sr-only" htmlFor="vessel-search">
        {t("Cerca una nave")}
      </label>
      <input
        id="vessel-search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length && setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder={t("Nome, MMSI o IMO")}
        autoComplete="off"
      />
      {open && (
        <div className="search-results">
          <p role="status">{status ? errorText(status) : ""}</p>
          {results.map((v) => (
            <button
              key={v.mmsi}
              onClick={() => {
                selection.current = true;
                setQuery(v.name);
                setOpen(false);
                onSelect(v);
              }}
            >
              <strong>{v.name}</strong>
              <span>
                {v.mmsi} · {shipNames[v.ship_type]}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";
import { useLanguage } from "./LanguageProvider";
import { useMapUI } from "./MapUIProvider";
import { useEffect, useRef, useState } from "react";
import { searchVessels } from "../lib/api";
import type { Vessel } from "../../shared/types";
export default function SearchBar({
  onSelect,
  onFocus,
}: {
  onSelect: (v: Vessel) => void;
  onFocus?: () => void;
}) {
  const { t, shipNames, errorText } = useLanguage();
  const { isMobile, menuOpen, panel } = useMapUI();
  const [query, setQuery] = useState(""),
    [results, setResults] = useState<Vessel[]>([]),
    [status, setStatus] = useState(""),
    [open, setOpen] = useState(false),
    [active, setActive] = useState(-1);
  const selection = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const choose = (vessel: Vessel) => {
    selection.current = vessel.name !== query;
    setQuery(vessel.name);
    setOpen(false);
    setActive(-1);
    input.current?.blur();
    onSelect(vessel);
  };
  useEffect(() => {
    if (!isMobile || (!menuOpen && !panel)) return;
    setOpen(false);
    setActive(-1);
    input.current?.blur();
  }, [isMobile, menuOpen, panel]);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (
        !(event.target instanceof Node) ||
        container.current?.contains(event.target)
      )
        return;
      setOpen(false);
      setActive(-1);
      input.current?.blur();
    };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, []);
  useEffect(() => {
    if (selection.current) {
      selection.current = false;
      return;
    }
    const controller = new AbortController();
    setResults([]);
    setActive(-1);
    setStatus("");
    if (query.trim().length < 2) {
      setOpen(false);
      return () => controller.abort();
    }
    const timer = setTimeout(() => {
      setStatus(t("Ricerca in corso…"));
      if (document.activeElement === input.current) setOpen(true);
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
    <div
      className="search-panel"
      ref={container}
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return;
        setOpen(false);
        setActive(-1);
      }}
    >
      <label className="sr-only" htmlFor="vessel-search">
        {t("Cerca una nave")}
      </label>
      <input
        id="vessel-search"
        ref={input}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls="vessel-search-results"
        aria-activedescendant={
          open && active >= 0 ? `vessel-search-option-${active}` : undefined
        }
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => {
          onFocus?.();
          if (results.length) setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            setActive(-1);
          } else if (e.key === "ArrowDown" && results.length) {
            e.preventDefault();
            setOpen(true);
            setActive((previous) => Math.min(previous + 1, results.length - 1));
          } else if (e.key === "ArrowUp" && results.length) {
            e.preventDefault();
            setOpen(true);
            setActive((previous) =>
              previous <= 0 ? results.length - 1 : previous - 1,
            );
          } else if (e.key === "Enter" && open && active >= 0) {
            e.preventDefault();
            choose(results[active]);
          }
        }}
        placeholder={t("Nome, MMSI o IMO")}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        enterKeyHint="search"
      />
      {open && (
        <div className="search-results">
          <p role="status">{status ? errorText(status) : ""}</p>
          <div
            role="listbox"
            id="vessel-search-results"
            aria-label={t("Risultati ricerca")}
          >
            {results.map((v, index) => (
              <button
                key={v.mmsi}
                id={`vessel-search-option-${index}`}
                type="button"
                role="option"
                aria-selected={active === index}
                tabIndex={-1}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => choose(v)}
              >
                <strong>{v.name}</strong>
                <span>
                  {v.mmsi} · {shipNames[v.ship_type]}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

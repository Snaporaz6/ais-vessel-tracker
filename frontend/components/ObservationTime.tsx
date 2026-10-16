"use client";
import { useEffect, useState } from "react";
import { observationAge } from "../lib/observation-age";
import { useLanguage } from "./LanguageProvider";

export default function ObservationTime({ timestamp }: { timestamp: string }) {
  const { t, date } = useLanguage();
  // Server and first client render agree; age is measured by the browser clock.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    refresh();
    const timer = window.setInterval(refresh, 30_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  const age = now === null ? "recent" : observationAge(timestamp, now);
  return (
    <p className={`timestamp observation-time observation-time--${age}`}>
      <time dateTime={timestamp}>{date(timestamp)}</time>
      {age !== "recent" && (
        <span className="observation-age-badge">
          {t(
            age === "old"
              ? "Dato vecchio · oltre 1 ora"
              : "Dato non recente · oltre 15 minuti",
          )}
        </span>
      )}
    </p>
  );
}

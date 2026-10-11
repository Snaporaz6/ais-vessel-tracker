"use client";

import { useEffect, useRef, useState } from "react";
import type { VesselPosition } from "../../shared/types";
import { trackMoment } from "../lib/track-playback";
import { useLanguage } from "./LanguageProvider";

export default function TrackTimeline({
  points,
  at,
  onChange,
  onLocate,
  compact = false,
}: {
  points: VesselPosition[];
  at: number | null;
  onChange: (at: number | null) => void;
  onLocate: (position: VesselPosition) => void;
  compact?: boolean;
}) {
  const { t, date } = useLanguage();
  const moment = trackMoment(points, at);
  const [playing, setPlaying] = useState(false);
  const clock = useRef(0);
  const firstAt = moment?.firstAt ?? 0,
    lastAt = moment?.lastAt ?? 0;
  useEffect(() => {
    if (!playing || firstAt === lastAt) return;
    // Roughly 30 seconds for the available window, with no automatic playback
    // or interpolation. The marker advances between actual received fixes.
    const timer = window.setInterval(() => {
      clock.current = Math.min(
        lastAt,
        clock.current + Math.max(1000, (lastAt - firstAt) / 240),
      );
      onChange(clock.current >= lastAt ? null : clock.current);
      if (clock.current >= lastAt) setPlaying(false);
    }, 125);
    const pause = () => {
      if (document.hidden) setPlaying(false);
    };
    document.addEventListener("visibilitychange", pause);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", pause);
    };
  }, [playing, firstAt, lastAt, onChange]);
  if (!moment) return null;
  const select = (time: number | null) => {
    setPlaying(false);
    onChange(time);
  };
  const previousIndex =
    moment.at > Date.parse(points[moment.index].timestamp)
      ? moment.index
      : moment.index - 1;
  const locateButton = (
    <button
      type="button"
      className="track-locate"
      disabled={!moment.position}
      aria-label={t("Centra sulla posizione mostrata")}
      onClick={() => {
        if (moment.position) onLocate(moment.position);
      }}
    >
      {t("Centra")}
    </button>
  );
  return (
    <section
      className="track-timeline"
      aria-label={t("Riproduzione della traccia")}
    >
      <div className="track-timeline-heading">
        <strong>
          {t(moment.live ? "Ultima posizione AIS" : "Posizione storica")}
        </strong>
        <time dateTime={new Date(moment.at).toISOString()}>
          {date(new Date(moment.at).toISOString())}
        </time>
      </div>
      <input
        type="range"
        aria-label={t("Data e ora della traccia")}
        aria-valuetext={date(new Date(moment.at).toISOString())}
        min={firstAt}
        max={lastAt}
        step="any"
        value={moment.at}
        disabled={firstAt === lastAt}
        onChange={(event) => {
          const value = Number(event.target.value);
          select(value >= lastAt ? null : value);
        }}
      />
      <div className="track-timeline-bounds" aria-hidden="true">
        <span>{date(points[0].timestamp)}</span>
        <span>{date(moment.latest.timestamp)}</span>
      </div>
      <div className="track-timeline-actions">
        <button
          type="button"
          aria-label={t("Osservazione precedente")}
          disabled={previousIndex < 0}
          onClick={() => select(Date.parse(points[previousIndex].timestamp))}
        >
          ‹
        </button>
        <button
          type="button"
          disabled={firstAt === lastAt}
          onClick={() => {
            if (playing) {
              setPlaying(false);
              return;
            }
            clock.current = moment.live ? firstAt : moment.at;
            if (moment.live) onChange(firstAt);
            setPlaying(true);
          }}
        >
          {t(playing ? "Pausa" : "Riproduci")}
        </button>
        <button
          type="button"
          aria-label={t("Osservazione successiva")}
          disabled={moment.index >= points.length - 1}
          onClick={() =>
            select(
              moment.index + 1 === points.length - 1
                ? null
                : Date.parse(points[moment.index + 1].timestamp),
            )
          }
        >
          ›
        </button>
        <button
          type="button"
          disabled={moment.live}
          aria-label={t("Ultima posizione")}
          onClick={() => select(null)}
        >
          {t(compact ? "Ultima" : "Ultima posizione")}
        </button>
        {compact && locateButton}
      </div>
      {!compact && locateButton}
      {moment.gap ? (
        <p className="track-timeline-gap" role="status">
          {t("Nessuna posizione ricevuta in questo intervallo.")}{" "}
          {date(moment.gap.from)} — {date(moment.gap.to)}
        </p>
      ) : (
        <p className="track-timeline-fix">
          {t("Osservazione mostrata: {date}", {
            date: date(moment.position?.timestamp),
          })}
        </p>
      )}
    </section>
  );
}

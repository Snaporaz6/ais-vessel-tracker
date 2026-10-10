"use client";
import { useLanguage } from "./LanguageProvider";
import type { TrackDisplayInfo } from "../lib/track-display";

export default function TrackSummary({
  info,
  showLinks,
  onShowLinks,
}: {
  info: TrackDisplayInfo | null;
  showLinks: boolean;
  onShowLinks: (show: boolean) => void;
}) {
  const { t, date, numbers, errorText } = useLanguage();
  return (
    <section
      className="track-summary"
      aria-label={t("Copertura della traccia")}
    >
      <h2>{t("Copertura della traccia")}</h2>
      {!info || info.loading ? (
        <p role="status">{t("Caricamento traccia…")}</p>
      ) : info.error ? (
        <p role="alert">{errorText(info.error)}</p>
      ) : info.count === 0 ? (
        <p>{t("Nessuna osservazione nella finestra scelta.")}</p>
      ) : (
        <>
          <p className="track-coverage-count">
            {t("{count} punti", { count: numbers(info.count) })} ·{" "}
            {t("{count} interruzioni", { count: numbers(info.gaps.length) })}
          </p>
          <p className="small">
            {date(info.firstAt)} — {date(info.lastAt)}
          </p>
          <div className="track-legend">
            <span>
              <i className="track-swatch observed" />
              {t("Posizioni AIS ricevute")}
            </span>
            {info.gaps.length > 0 && (
              <span>
                <i className="track-swatch missing" />
                {t("Intervalli senza osservazioni")}
              </span>
            )}
          </div>
          {info.gaps.length > 0 ? (
            <>
              <p>
                {t(
                  "La linea si interrompe dove mancano osservazioni AIS. I punti arancioni segnano i limiti dei vuoti.",
                )}
              </p>
              <label className="track-gap-toggle">
                <input
                  type="checkbox"
                  checked={showLinks}
                  onChange={(e) => onShowLinks(e.target.checked)}
                />
                {t("Mostra collegamenti indicativi")}
              </label>
              <p className="small">
                {t(
                  "I tratti tratteggiati collegano in linea retta le posizioni note: non ricostruiscono il percorso reale.",
                )}
              </p>
              <details>
                <summary>{t("Dettaglio delle interruzioni")}</summary>
                <ol className="track-gap-list">
                  {info.gaps.map((gap) => {
                    const minutes = Math.round(
                      (Date.parse(gap.to) - Date.parse(gap.from)) / 60000,
                    );
                    return (
                      <li key={`${gap.from}:${gap.to}`}>
                        <strong>
                          {t("{hours} h {minutes} min", {
                            hours: Math.floor(minutes / 60),
                            minutes: minutes % 60,
                          })}
                        </strong>
                        <span>
                          {date(gap.from)} → {date(gap.to)}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </details>
            </>
          ) : (
            <p>
              {t(
                "Nessuna interruzione segnalata nelle osservazioni disponibili.",
              )}
            </p>
          )}
        </>
      )}
    </section>
  );
}

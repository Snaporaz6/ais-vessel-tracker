"use client";
import { LANGUAGE_NAMES, LOCALES, isLocale } from "../lib/i18n";
import { useLanguage } from "./LanguageProvider";

export default function LanguageSelector() {
  const { locale, t, manual, select, reset } = useLanguage();
  return (
    <div className="language-switch">
      <svg
        aria-hidden="true"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <circle cx="12" cy="12" r="9" />
        <ellipse cx="12" cy="12" rx="4" ry="9" />
        <path d="M3 12h18" />
      </svg>
      <label htmlFor="site-language" className="sr-only">
        {t("Lingua")}
      </label>
      <select
        id="site-language"
        value={locale}
        onChange={(event) => {
          if (isLocale(event.target.value)) select(event.target.value);
        }}
      >
        {LOCALES.map((code) => (
          <option key={code} value={code} lang={code}>
            {LANGUAGE_NAMES[code]}
          </option>
        ))}
      </select>
      <button
        type="button"
        aria-pressed={!manual}
        title={t("Rileva automaticamente")}
        aria-label={t("Rileva automaticamente")}
        onClick={reset}
      >
        Auto
      </button>
    </div>
  );
}

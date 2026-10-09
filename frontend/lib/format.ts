import type { ShipType } from "../../shared/types";
import { INTL_LOCALES, translate, type Locale } from "./i18n";
const SHIP_NAMES: Record<ShipType, string> = {
  cargo: "Cargo",
  tanker: "Petroliera",
  passenger: "Passeggeri",
  fishing: "Pesca",
  tug: "Rimorchiatore",
  pleasure: "Diporto",
  military: "Militare",
  other: "Tipo non disponibile",
};
export function createFormatters(locale: Locale) {
  const t = (key: string, params?: Record<string, string | number>) =>
    translate(locale, key, params);
  const intl = INTL_LOCALES[locale];
  const numbers = (number: number) => number.toLocaleString(intl);
  const decimal = (number: number) =>
    number.toLocaleString(intl, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
  const shipNames = Object.fromEntries(
    Object.entries(SHIP_NAMES).map(([key, label]) => [key, t(label)]),
  ) as Record<ShipType, string>;
  const date = (input: string | null | undefined) => {
    if (!input || !Number.isFinite(new Date(input).getTime()))
      return t("Non disponibile");
    return (
      new Date(input).toLocaleString(intl, {
        timeZone: "UTC",
        dateStyle: "short",
        timeStyle: "short",
      }) + " UTC"
    );
  };
  const value = (number: number | null | undefined, suffix = "") =>
    number == null ? t("Non disponibile") : `${decimal(number)}${suffix}`;
  const duration = (hours: number) =>
    t(hours < 24 ? "{count} ore" : "{count} giorni", {
      count: decimal(hours < 24 ? hours : hours / 24),
    });
  return { date, value, duration, shipNames, numbers };
}

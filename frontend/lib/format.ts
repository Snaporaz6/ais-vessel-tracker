import type { ShipType } from "../../shared/types";
export const shipNames: Record<ShipType, string> = {
  cargo: "Cargo",
  tanker: "Petroliera",
  passenger: "Passeggeri",
  fishing: "Pesca",
  tug: "Rimorchiatore",
  pleasure: "Diporto",
  military: "Militare",
  other: "Tipo non disponibile",
};
export const date = (s: string | null | undefined) =>
  s
    ? new Date(s).toLocaleString("it-IT", {
        timeZone: "UTC",
        dateStyle: "short",
        timeStyle: "short",
      }) + " UTC"
    : "Non disponibile";
export const value = (n: number | null | undefined, suffix = "") =>
  n == null ? "Non disponibile" : `${n.toFixed(1)}${suffix}`;
export const duration = (hours: number) =>
  hours < 24 ? `${hours.toFixed(1)} ore` : `${(hours / 24).toFixed(1)} giorni`;

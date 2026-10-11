"use client";
import Link from "next/link";
import { useLanguage } from "./LanguageProvider";

export function BackToMap({
  short = false,
  mmsi,
}: {
  short?: boolean;
  mmsi?: string;
}) {
  const { t } = useLanguage();
  const href = mmsi && /^[1-9]\d{8}$/.test(mmsi) ? `/?vessel=${mmsi}` : "/";
  return (
    <Link href={href}>{t(short ? "← Mappa" : "← Mappa del Mediterraneo")}</Link>
  );
}
export function PageError({ message }: { message: string }) {
  const { errorText } = useLanguage();
  return (
    <p className="notice" role="alert">
      {errorText(message)}
    </p>
  );
}

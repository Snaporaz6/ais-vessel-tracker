"use client";
import Link from "next/link";
import { useLanguage } from "./LanguageProvider";

export function BackToMap({ short = false }: { short?: boolean }) {
  const { t } = useLanguage();
  return (
    <Link href="/">{t(short ? "← Mappa" : "← Mappa del Mediterraneo")}</Link>
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

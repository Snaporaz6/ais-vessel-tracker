"use client";
import { useLanguage } from "../components/LanguageProvider";
import { BackToMap } from "../components/LocalizedPage";
export default function NotFound() {
  const { t } = useLanguage();
  return (
    <main className="detail-page">
      <BackToMap />
      <h1>{t("Pagina non trovata")}</h1>
      <p>{t("L’indirizzo richiesto non esiste.")}</p>
    </main>
  );
}

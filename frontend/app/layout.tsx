import type { Metadata } from "next";
import { requestLanguage } from "../lib/i18n-server";
import { translate } from "../lib/i18n";
import LanguageProvider from "../components/LanguageProvider";
import LanguageSelector from "../components/LanguageSelector";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await requestLanguage();
  return {
    title: "AIS Vessel Tracker",
    description: translate(
      locale,
      "Osservazioni AIS nel Mediterraneo, storico e soste rilevate. Beta pubblica.",
    ),
  };
}
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const initial = await requestLanguage();
  return (
    <html lang={initial.locale}>
      <body>
        <LanguageProvider initial={initial}>
          <LanguageSelector />
          {children}
        </LanguageProvider>
      </body>
    </html>
  );
}

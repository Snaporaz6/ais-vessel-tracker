import type { Metadata } from "next";
import { requestLanguage } from "../lib/i18n-server";
import { translate } from "../lib/i18n";
import LanguageProvider from "../components/LanguageProvider";
import LanguageSelector from "../components/LanguageSelector";
import ThemeProvider from "../components/ThemeProvider";
import { cookies } from "next/headers";
import {
  isMapTheme,
  THEME_COOKIE,
  themeBootstrap,
} from "../lib/theme-preference";
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
  const savedTheme = (await cookies()).get(THEME_COOKIE)?.value;
  const theme = isMapTheme(savedTheme) ? savedTheme : "dark";
  return (
    <html lang={initial.locale} data-map-theme={theme} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>
        <LanguageProvider initial={initial}>
          <ThemeProvider initial={theme}>
            <LanguageSelector />
            {children}
          </ThemeProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}

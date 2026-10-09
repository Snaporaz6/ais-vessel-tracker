"use client";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  isLocale,
  LANGUAGE_COOKIE,
  translate,
  localizedError,
  type Locale,
  type Params,
} from "../lib/i18n";
import { createFormatters } from "../lib/format";

function languageTools(locale: Locale) {
  const t = (key: string, params?: Params) => translate(locale, key, params);
  return {
    locale,
    t,
    errorText: (message: string) => localizedError(locale, message),
    ...createFormatters(locale),
  };
}
type LanguageContext = ReturnType<typeof languageTools> & {
  manual: boolean;
  select: (locale: Locale) => void;
  reset: () => void;
};
const Context = createContext<LanguageContext | null>(null);

export default function LanguageProvider({
  initial,
  children,
}: {
  initial: { locale: Locale; automatic: Locale; manual: boolean };
  children: React.ReactNode;
}) {
  const [locale, setLocale] = useState(initial.locale);
  const [manual, setManual] = useState(initial.manual);
  const tools = useMemo(() => languageTools(locale), [locale]);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  function save(value: string, maxAge: number) {
    document.cookie = `${LANGUAGE_COOKIE}=${value}; Path=/; Max-Age=${maxAge}; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  }
  function select(next: Locale) {
    if (!isLocale(next)) return;
    save(next, 31536000);
    setLocale(next);
    setManual(true);
  }
  function reset() {
    save("", 0);
    setLocale(initial.automatic);
    setManual(false);
  }
  return (
    <Context.Provider value={{ ...tools, manual, select, reset }}>
      {children}
    </Context.Provider>
  );
}
export function useLanguage() {
  const context = useContext(Context);
  if (!context) throw new Error("LanguageProvider missing");
  return context;
}

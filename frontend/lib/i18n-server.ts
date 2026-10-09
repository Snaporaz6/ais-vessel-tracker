import { cache } from "react";
import { cookies, headers } from "next/headers";
import { automaticLocale, isLocale, LANGUAGE_COOKIE } from "./i18n";

export const requestLanguage = cache(async () => {
  const [cookieStore, requestHeaders] = await Promise.all([
    cookies(),
    headers(),
  ]);
  const preference = cookieStore.get(LANGUAGE_COOKIE)?.value;
  const automatic = automaticLocale(
    requestHeaders.get("x-vercel-ip-country"),
    requestHeaders.get("accept-language"),
  );
  return {
    locale: isLocale(preference) ? preference : automatic,
    automatic,
    manual: isLocale(preference),
  };
});

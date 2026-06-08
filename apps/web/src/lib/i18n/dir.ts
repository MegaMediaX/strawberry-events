export const locales = ["en", "ar"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

const rtlLocales = new Set<string>(["ar"]);

export function dirForLocale(locale: string): "rtl" | "ltr" {
  return rtlLocales.has(locale) ? "rtl" : "ltr";
}

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

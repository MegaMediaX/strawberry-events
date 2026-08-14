// Arabic was retired on 2026-08-14. The `ar` translations, the titleAr/
// descriptionAr database columns and the `locale === "ar"` branches are all
// left in place so the locale can be restored by re-adding "ar" here — the
// hand-written Arabic event copy still lives in the database.
export const locales = ["en"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

const rtlLocales = new Set<string>(["ar"]);

export function dirForLocale(locale: string): "rtl" | "ltr" {
  return rtlLocales.has(locale) ? "rtl" : "ltr";
}

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

import { defineRouting } from "next-intl/routing";
import { locales, defaultLocale } from "@/lib/i18n/dir";

export const routing = defineRouting({
  locales: [...locales],
  defaultLocale,
  localePrefix: "always",
});

"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { locales } from "@/lib/i18n/dir";
import { Button } from "@/components/ui/button";

export function LanguageSwitcher() {
  const t = useTranslations("common");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  return (
    /* role="group" is required for aria-label to be honoured — on a bare div
       the label is ignored. aria-pressed carries the active locale for screen
       readers, which colour alone did not. */
    <div className="inline-flex items-center gap-1" role="group" aria-label={t("language")}>
      {locales.map((l) => {
        const active = l === locale;
        return (
          <Button
            key={l}
            size="sm"
            variant={active ? "default" : "outline"}
            aria-pressed={active}
            lang={l}
            onClick={() => router.replace(pathname, { locale: l })}
          >
            {l === "ar" ? t("arabic") : t("english")}
          </Button>
        );
      })}
    </div>
  );
}

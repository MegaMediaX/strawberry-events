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
    <div className="inline-flex items-center gap-2" aria-label={t("language")}>
      {locales.map((l) => (
        <Button
          key={l}
          size="sm"
          variant={l === locale ? "default" : "outline"}
          onClick={() => router.replace(pathname, { locale: l })}
        >
          {l === "ar" ? t("arabic") : t("english")}
        </Button>
      ))}
    </div>
  );
}

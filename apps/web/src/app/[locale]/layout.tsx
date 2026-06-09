import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { Inter, IBM_Plex_Sans_Arabic } from "next/font/google";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { dirForLocale } from "@/lib/i18n/dir";
import { THEME_COOKIE } from "@/lib/theme/theme";
import "../globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-arabic",
});

export const metadata: Metadata = {
  title: "Strawberry Events",
  description: "Premium event registration platform.",
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  // Theme is resolved server-side from a cookie — no client script, no FOUC.
  const themeCookie = (await cookies()).get(THEME_COOKIE)?.value;
  const isDark = themeCookie === "dark";

  return (
    <html
      lang={locale}
      dir={dirForLocale(locale)}
      className={`${inter.variable} ${plexArabic.variable}${isDark ? " dark" : ""}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-background text-foreground antialiased">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}

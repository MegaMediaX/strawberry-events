import Link from "next/link";
import { cookies } from "next/headers";
import { LanguageSwitcher } from "@/components/language-switcher";
import { THEME_COOKIE } from "@/lib/theme/theme";
import { ThemeToggle } from "./theme-toggle";

export async function PublicNav({ locale }: { locale: string }) {
  // Resolve the theme from the same cookie the root layout uses to set the
  // <html class="dark"> attribute, so ThemeToggle's first render matches SSR.
  const initialDark = (await cookies()).get(THEME_COOKIE)?.value === "dark";

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link
          href={`/${locale}/events`}
          className="bg-[image:var(--gradient-hero)] bg-clip-text text-xl font-extrabold tracking-tight text-transparent"
        >
          Strawberry Events
        </Link>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <ThemeToggle initialDark={initialDark} />
        </div>
      </div>
    </header>
  );
}

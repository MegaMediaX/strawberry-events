import Link from "next/link";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "./theme-toggle";

export function PublicNav({ locale }: { locale: string }) {
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
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

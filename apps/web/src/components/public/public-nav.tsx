import Link from "next/link";
import { cookies } from "next/headers";
import { getSessionContext } from "@/lib/auth/session";
import { LanguageSwitcher } from "@/components/language-switcher";
import { THEME_COOKIE } from "@/lib/theme/theme";
import { ThemeToggle } from "./theme-toggle";
import { signOutAction } from "@/lib/auth/sign-out-action";

export async function PublicNav({ locale }: { locale: string }) {
  const initialDark = (await cookies()).get(THEME_COOKIE)?.value === "dark";
  const session = await getSessionContext();

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link
          href={`/${locale}/events`}
          className="bg-[image:var(--gradient-hero)] bg-clip-text text-xl font-extrabold tracking-tight text-transparent"
        >
          Strawberry Events
        </Link>
        <nav className="flex items-center gap-1">
          {session ? (
            <>
              <Link
                href={`/${locale}/my-tickets`}
                className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                My tickets
              </Link>
              <form action={signOutAction.bind(null, locale)}>
                <button
                  type="submit"
                  className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
                >
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <Link
              href={`/${locale}/login`}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              Sign in
            </Link>
          )}
          <LanguageSwitcher />
          <ThemeToggle initialDark={initialDark} />
        </nav>
      </div>
    </header>
  );
}

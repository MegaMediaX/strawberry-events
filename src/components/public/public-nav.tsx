import Link from "next/link";
import { cookies } from "next/headers";
import { getSessionContext } from "@/lib/auth/session";
import { THEME_COOKIE } from "@/lib/theme/theme";
import { ThemeToggle } from "./theme-toggle";
import { signOutAction } from "@/lib/auth/sign-out-action";

export async function PublicNav({ locale }: { locale: string }) {
  const initialDark = (await cookies()).get(THEME_COOKIE)?.value === "dark";
  const session = await getSessionContext();

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-4 py-3">
        <Link
          href={`/${locale}/events`}
          /* whitespace-nowrap stops the wordmark breaking onto two lines on a
             375px viewport; the gradient clip needs an explicit text colour
             underneath it so the name is still legible if the clip fails. */
          className="shrink-0 whitespace-nowrap bg-[image:var(--gradient-hero)] bg-clip-text text-lg font-extrabold tracking-tight text-primary [-webkit-text-fill-color:transparent] sm:text-xl"
        >
          Strawberry Events
        </Link>
        <nav className="flex min-w-0 items-center gap-1">
          {session ? (
            <>
              <Link
                href={`/${locale}/my-tickets`}
                className="inline-flex min-h-10 shrink-0 items-center whitespace-nowrap rounded-md px-2 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground sm:px-3"
              >
                My tickets
              </Link>
              <form action={signOutAction.bind(null, locale)}>
                <button
                  type="submit"
                  className="inline-flex min-h-10 shrink-0 items-center whitespace-nowrap rounded-md px-2 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground sm:px-3"
                >
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <Link
              href={`/${locale}/login`}
              className="inline-flex min-h-10 shrink-0 items-center whitespace-nowrap rounded-md px-2 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground sm:px-3"
            >
              Sign in
            </Link>
          )}
          <ThemeToggle initialDark={initialDark} />
        </nav>
      </div>
    </header>
  );
}

import Link from "next/link";
import { getSessionContext } from "@/lib/auth/session";
import { ThemeToggle } from "./theme-toggle";
import { signOutAction } from "@/lib/auth/sign-out-action";

export async function PublicNav({ locale }: { locale: string }) {
  const session = await getSessionContext();

  return (
    <header className="site-header sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
      {/* A FIXED height, not padding-derived: the registration stepper sticks
          directly below this bar and needs a number to offset by. Keep this
          and --nav-height in globals.css in step. */}
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-2 px-4">
        <Link
          href={`/${locale}/events`}
          /* whitespace-nowrap stops the wordmark breaking onto two lines on a
             375px viewport; the gradient clip needs an explicit text colour
             underneath it so the name is still legible if the clip fails. */
          className="shrink-0 whitespace-nowrap text-lg font-extrabold tracking-tight text-primary sm:text-xl"
        >
          Strawberry Agency Events
        </Link>
        <nav className="flex min-w-0 items-center gap-1">
          {session ? (
            <>
              <Link
                href={`/${locale}/my-registrations`}
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
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}

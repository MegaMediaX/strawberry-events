import { setRequestLocale } from "next-intl/server";

/**
 * Layout for the badge contact card.
 *
 * A route group, so the URL is unchanged — `/en/c/<slug>` still resolves — but
 * the page no longer inherits `PublicNav`.
 *
 * The nav is written for someone with an account: "Sign in", "My tickets", a
 * theme toggle. The reader here is a stranger who just scanned someone's
 * lanyard and will never have an account, so that chrome is noise at best, and
 * its wordmark competes with the one thing the page is for — Save contact.
 */
export default async function CardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <div className="flex min-h-screen flex-col">{children}</div>;
}

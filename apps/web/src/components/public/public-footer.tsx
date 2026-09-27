import Link from "next/link";

const CONTACT_EMAIL = "events@strawberryagency.com";

/**
 * Who runs this site, how to reach them, and the policies.
 *
 * The public pages collect names, phone numbers and job titles, yet until now
 * nothing on them named the organiser or linked the privacy policy — the legal
 * pages existed and no page pointed at them. One quiet line: it is reference,
 * not navigation, so it takes the muted tone and never the red.
 */
export function PublicFooter({ locale }: { locale: string }) {
  const link =
    "inline-flex min-h-11 items-center underline-offset-4 hover:text-foreground hover:underline";
  return (
    <footer className="site-footer mt-16 border-t border-border/60">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-1 px-4 py-4 text-sm text-muted-foreground sm:px-6">
        <span>Strawberry Agency</span>
        <a className={link} href={`mailto:${CONTACT_EMAIL}`}>
          {CONTACT_EMAIL}
        </a>
        <Link className={link} href={`/${locale}/legal/privacy`}>
          Privacy
        </Link>
        <Link className={link} href={`/${locale}/legal/terms`}>
          Terms
        </Link>
      </div>
    </footer>
  );
}

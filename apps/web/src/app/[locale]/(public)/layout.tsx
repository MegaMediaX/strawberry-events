import { ViewTransition } from "react";
import { setRequestLocale } from "next-intl/server";
import { DISSOLVE } from "@/lib/motion";
import { PublicNav } from "@/components/public/public-nav";

/**
 * The public shell, and where the site's scenes are cut together.
 *
 * Every navigation used to replace the whole page at once, so the index and the
 * event page read as two documents rather than two shots of the same thing.
 * The content is now wrapped in a transition that dissolves — but only when the
 * link that started the navigation asked for it.
 *
 * `default="none"` is the important prop. It means this animates for NOTHING
 * except a navigation that explicitly carried the "dissolve" type, so:
 *
 *  - the registration form is excluded by default. The review's rule is that
 *    the form never dissolves; the way it never dissolves is that no link into
 *    it is tagged. A rule enforced at each call site is a rule forgotten at one
 *    of them.
 *  - a first load, a back button, a `router.refresh()` from the ticket screen's
 *    own polling — none of them animate. Especially that last one: a page that
 *    quietly re-fetches itself every twenty seconds must not blink each time.
 */
export default async function PublicLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <div className="flex min-h-screen flex-col">
      {/* The nav names ITSELF (see .site-header in globals.css) rather than
          being wrapped here: this bar is `sticky top-0`, and an extra element
          around it is an extra link in the chain its stickiness depends on. */}
      <PublicNav locale={locale} />
      {/* `update`, not `enter`/`exit`.
          This element lives in the LAYOUT, which persists across every route
          that shares it — so it never mounts or unmounts, and enter/exit never
          fire. Written with those two first, it typechecked, passed its tests,
          built cleanly and animated nothing at all; a navigation in a real
          production build produced zero view-transition animations. What
          changes here is the CHILDREN, and the prop for that is `update`. */}
      <ViewTransition
        update={{ [DISSOLVE]: DISSOLVE, default: "none" }}
        default="none"
      >
        <div className="flex-1">{children}</div>
      </ViewTransition>
    </div>
  );
}

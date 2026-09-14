"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { defaultLocale, isLocale } from "@/lib/i18n/dir";
import { cn } from "@/lib/utils";

/**
 * Rendered wherever a page calls `notFound()` under /[locale].
 *
 * Most arrivals here are not mistyped URLs: they are expired or superseded
 * links out of an inbox — a magic-link token that no longer resolves, an order
 * code for a cancelled registration, an event whose slug changed. The previous
 * behaviour was the framework's bare 404, with no navigation of any kind, so
 * the attendee's only move was the back button.
 *
 * The locale comes from the path rather than from params, which a not-found
 * boundary does not receive.
 */
export default function LocaleNotFound() {
  const pathname = usePathname() ?? "";
  const first = pathname.split("/").filter(Boolean)[0] ?? "";
  const locale = isLocale(first) ? first : defaultLocale;

  return (
    <main className="mx-auto max-w-md px-4 py-16 text-center">
      <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        Not found
      </p>
      <h1 className="mt-2 font-heading text-[32px] leading-[1.05] tracking-[-0.01em]">
        This page isn&rsquo;t here
      </h1>
      <p className="mt-3 text-[15px] leading-[1.55] text-muted-foreground">
        The link may have expired, or the event may have finished. If it came from a
        registration email, open the most recent message we sent you — ticket links are
        reissued each time.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link
          href={`/${locale}/events`}
          className={cn(buttonVariants({ size: "lg" }), "h-11 px-6")}
        >
          Browse events
        </Link>
        <Link
          href={`/${locale}/my-registrations`}
          className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 px-6")}
        >
          My registrations
        </Link>
      </div>
    </main>
  );
}

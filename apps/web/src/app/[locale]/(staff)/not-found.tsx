"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { defaultLocale, isLocale } from "@/lib/i18n/dir";
import { cn } from "@/lib/utils";

/**
 * The staff area's own not-found.
 *
 * Without one, `notFound()` inside /staff reached the boundary at
 * `app/[locale]/not-found.tsx` — which is written for an attendee holding an
 * expired ticket link, and offered a door operator "Browse events" and "My
 * registrations". The two audiences need different words and different exits,
 * so they get different boundaries.
 *
 * What actually lands here now is a named event that does not exist or that
 * this account may not open; a missing event is answered with a picker on the
 * route itself.
 *
 * Locale comes from the path: a not-found boundary receives no params.
 */
export default function StaffNotFound() {
  const pathname = usePathname() ?? "";
  const first = pathname.split("/").filter(Boolean)[0] ?? "";
  const locale = isLocale(first) ? first : defaultLocale;

  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        Not available
      </p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight">
        This event isn&rsquo;t open to this account
      </h1>
      <p className="mt-3 text-[15px] leading-[1.55] text-muted-foreground">
        It may have been removed, or this account may not be assigned to it. Pick one of
        your events below — if the one you need is missing, an organiser can grant access.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link
          href={`/${locale}/staff/checkin`}
          className={cn(buttonVariants({ size: "lg" }), "h-11 px-6")}
        >
          Check-in
        </Link>
        <Link
          href={`/${locale}/staff/registrations`}
          className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 px-6")}
        >
          Walk-in
        </Link>
      </div>
    </div>
  );
}

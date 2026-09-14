import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { centsToPrice } from "@/lib/pretix/mappers";
import { AvailabilityBar } from "./availability-bar";
import { AddToCalendar } from "./add-to-calendar";
import type { CalendarEvent } from "@/lib/calendar/ics";

export interface RailTicket {
  id: number;
  titleEn: string;
  titleAr: string | null;
  descriptionEn: string | null;
  descriptionAr: string | null;
  priceCents: number;
}

export function TicketRail({
  locale,
  slug,
  tickets,
  capacity,
  calendar,
  soldOut,
}: {
  locale: string;
  slug: string;
  tickets: RailTicket[];
  capacity: { sold: number; total: number | null };
  calendar: CalendarEvent;
  soldOut: boolean;
}) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-card p-5 shadow-sm lg:sticky lg:top-20">
      <h2 className="text-base font-semibold">Tickets</h2>
      <ul className="mt-3 flex flex-col gap-2">
        {tickets.map((t) => (
          <li
            key={t.id}
            className="flex items-start justify-between rounded-md bg-muted/40 px-3 py-2.5 text-sm"
          >
            <span className="leading-tight">
              <span className="block font-medium">
                {locale === "ar" && t.titleAr ? t.titleAr : t.titleEn}
              </span>
              {(locale === "ar" && t.descriptionAr ? t.descriptionAr : t.descriptionEn) && (
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {locale === "ar" && t.descriptionAr ? t.descriptionAr : t.descriptionEn}
                </span>
              )}
            </span>
            <span className="ms-4 shrink-0 font-semibold text-foreground">
              {t.priceCents === 0 ? (
                <span className="text-emerald-600 dark:text-emerald-400">Free</span>
              ) : (
                `$${centsToPrice(t.priceCents)}`
              )}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-4">
        <AvailabilityBar sold={capacity.sold} total={capacity.total} />
      </div>
      {/* A sold-out event renders no link at all. Disabling a button INSIDE a
          <Link> disables nothing: the anchor stays in the tab order, Enter
          still navigates, and a click that lands on the link rather than the
          button navigates too — so attendees reached a full registration
          wizard for an event with nothing left to sell. The open case styles
          the anchor itself rather than wrapping a button, which also drops the
          invalid <a><button> nesting. */}
      {soldOut ? (
        <Button className="mt-4 w-full" size="lg" disabled>
          Sold out
        </Button>
      ) : (
        <Link
          href={`/${locale}/events/${slug}/register`}
          className={cn(buttonVariants({ size: "lg" }), "mt-4 w-full")}
        >
          Register now
        </Link>
      )}
      <AddToCalendar event={calendar} icsHref={`/${locale}/events/${slug}/calendar.ics`} />
    </div>
  );
}

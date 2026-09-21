import Link from "next/link";
import { Press, pressClass } from "@/components/paper/press";
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
    <div className="paper-plate p-5 lg:sticky lg:top-20">
      <h2 className="text-base font-semibold">Tickets</h2>
      <ul className="mt-3 flex flex-col gap-2">
        {tickets.map((t) => (
          <li
            key={t.id}
            className="flex items-start justify-between border-b border-[color:var(--paper-rule)] py-2.5 text-sm last:border-b-0"
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
            <span className="ms-4 shrink-0 font-semibold tabular-nums text-foreground">
              {t.priceCents === 0 ? (
                <span className="text-[var(--brand-success-text)]">Free</span>
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
        <Press className="mt-4 w-full" size="lg" disabled>
          Sold out
        </Press>
      ) : (
        <Link
          href={`/${locale}/events/${slug}/register`}
          className={pressClass("ink", "lg", "mt-4 w-full")}
        >
          Register now
        </Link>
      )}
      <AddToCalendar event={calendar} icsHref={`/${locale}/events/${slug}/calendar.ics`} />
    </div>
  );
}

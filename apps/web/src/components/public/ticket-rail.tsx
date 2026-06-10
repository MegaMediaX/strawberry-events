import Link from "next/link";
import { Button } from "@/components/ui/button";
import { centsToPrice } from "@/lib/pretix/mappers";
import { AvailabilityBar } from "./availability-bar";
import { AddToCalendar } from "./add-to-calendar";
import type { CalendarEvent } from "@/lib/calendar/ics";

export interface RailTicket {
  id: number;
  titleEn: string;
  titleAr: string | null;
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
            <span className="font-medium leading-tight">
              {locale === "ar" && t.titleAr ? t.titleAr : t.titleEn}
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
      <Link href={`/${locale}/events/${slug}/register`} className="mt-4 block">
        <Button className="w-full" size="lg" disabled={soldOut}>
          {soldOut ? "Sold out" : "Register now"}
        </Button>
      </Link>
      <AddToCalendar event={calendar} icsHref={`/${locale}/events/${slug}/calendar.ics`} />
    </div>
  );
}

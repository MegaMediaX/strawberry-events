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
    <div className="rounded-[var(--radius-lg)] border border-border bg-card p-4 shadow-sm lg:sticky lg:top-20">
      <h2 className="text-sm font-semibold">Tickets</h2>
      <ul className="mt-2 divide-y divide-border">
        {tickets.map((t) => (
          <li key={t.id} className="flex items-center justify-between py-2 text-sm">
            <span>{locale === "ar" && t.titleAr ? t.titleAr : t.titleEn}</span>
            <span className="text-muted-foreground">
              {t.priceCents === 0 ? "Free" : `$${centsToPrice(t.priceCents)}`}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3">
        <AvailabilityBar sold={capacity.sold} total={capacity.total} />
      </div>
      <Link href={`/${locale}/events/${slug}/register`} className="mt-4 block">
        <Button className="w-full" disabled={soldOut}>
          {soldOut ? "Sold out" : "Register"}
        </Button>
      </Link>
      <AddToCalendar event={calendar} />
    </div>
  );
}

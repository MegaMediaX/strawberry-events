import { venueWallClockToUtc } from "@/lib/datetime/uk";

export interface CalendarEvent {
  title: string;
  start: string; // ISO
  end?: string | null; // ISO
  location?: string | null;
  description?: string | null;
}

/** Date → iCal UTC basic format (YYYYMMDDTHHMMSSZ). */
function formatICalUtc(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/**
 * A genuine instant (e.g. DTSTAMP "when was this file generated") → iCal UTC.
 * Do NOT use this for event times — see {@link venueToICalUtc}.
 */
function instantToICalUtc(iso: string): string {
  return formatICalUtc(new Date(iso));
}

/**
 * An event time → iCal UTC.
 *
 * Event times reach us as naive VENUE wall-clock: the digits mean "09:30 at the
 * venue", even though they arrive labelled with a Z. Emitting them unconverted
 * told every calendar app "09:30 UTC", so a Beirut attendee saw 12:30 — three
 * hours after the real start, and three hours after what our own event page
 * displayed. Convert to the true instant so each attendee's calendar renders the
 * correct local time wherever they are.
 */
function venueToICalUtc(iso: string): string {
  const d = venueWallClockToUtc(iso);
  // Unparseable input falls back to the raw value rather than throwing — a
  // slightly wrong calendar entry beats a 500 on the event page.
  return formatICalUtc(d ?? new Date(iso));
}

function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n");
}

export function buildIcs(ev: CalendarEvent): string {
  const start = venueToICalUtc(ev.start);
  const end = venueToICalUtc(ev.end ?? ev.start);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Strawberry Events//EN",
    "BEGIN:VEVENT",
    `UID:${start}-${Math.random().toString(36).slice(2)}@strawberry`,
    `DTSTAMP:${instantToICalUtc(new Date().toISOString())}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${escapeText(ev.title)}`,
    ev.location ? `LOCATION:${escapeText(ev.location)}` : "",
    ev.description ? `DESCRIPTION:${escapeText(ev.description)}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);
  return lines.join("\r\n");
}

export function googleCalUrl(ev: CalendarEvent): string {
  const dates = `${venueToICalUtc(ev.start)}/${venueToICalUtc(ev.end ?? ev.start)}`;
  const params = new URLSearchParams({ action: "TEMPLATE", text: ev.title });
  if (ev.location) params.set("location", ev.location);
  if (ev.description) params.set("details", ev.description);
  // dates appended raw — Google expects an unencoded "start/end" range.
  return `https://calendar.google.com/calendar/render?${params.toString()}&dates=${dates}`;
}

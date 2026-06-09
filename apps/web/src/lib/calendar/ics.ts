export interface CalendarEvent {
  title: string;
  start: string; // ISO
  end?: string | null; // ISO
  location?: string | null;
  description?: string | null;
}

/** ISO → iCal UTC basic format (YYYYMMDDTHHMMSSZ). */
function toICalUtc(iso: string): string {
  const d = new Date(iso);
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n");
}

export function buildIcs(ev: CalendarEvent): string {
  const start = toICalUtc(ev.start);
  const end = toICalUtc(ev.end ?? ev.start);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Strawberry Events//EN",
    "BEGIN:VEVENT",
    `UID:${start}-${Math.random().toString(36).slice(2)}@strawberry`,
    `DTSTAMP:${toICalUtc(new Date().toISOString())}`,
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
  const dates = `${toICalUtc(ev.start)}/${toICalUtc(ev.end ?? ev.start)}`;
  const params = new URLSearchParams({ action: "TEMPLATE", text: ev.title });
  if (ev.location) params.set("location", ev.location);
  if (ev.description) params.set("details", ev.description);
  // dates appended raw — Google expects an unencoded "start/end" range.
  return `https://calendar.google.com/calendar/render?${params.toString()}&dates=${dates}`;
}

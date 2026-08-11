import { describe, it, expect } from "vitest";
import { buildIcs, googleCalUrl } from "@/lib/calendar/ics";

/**
 * `start`/`end` are naive VENUE wall-clock, as stored: "09:00" means nine in the
 * morning at the venue, despite the Z suffix Prisma attaches. Calendar exports
 * must publish the real instant, because the receiving app converts into the
 * reader's own zone.
 *
 * These assertions previously expected the digits to pass through unchanged,
 * which is what shipped a calendar file three hours adrift from the event page
 * beside it. Beirut is UTC+3 on 1 September, so 09:00 venue time is 06:00Z.
 */
const ev = {
  title: "Tech Expo",
  start: "2026-09-01T09:00:00Z",
  end: "2026-09-01T17:00:00Z",
  location: "Beirut Forum",
  description: "Annual expo",
};

describe("buildIcs", () => {
  it("produces a VCALENDAR with summary and venue-converted dtstart", () => {
    const ics = buildIcs(ev);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics).toContain("SUMMARY:Tech Expo");
    expect(ics).toContain("DTSTART:20260901T060000Z");
    expect(ics).toContain("DTEND:20260901T140000Z");
    expect(ics).toContain("LOCATION:Beirut Forum");
  });

  it("does NOT emit the stored digits verbatim", () => {
    // The exact regression: publishing "09:00Z" tells every calendar the event
    // starts three hours after it really does.
    const ics = buildIcs(ev);
    expect(ics).not.toContain("DTSTART:20260901T090000Z");
  });

  it("stamps DTSTAMP as a true instant, not a venue conversion", () => {
    // DTSTAMP is "when was this file generated" — already absolute. Running it
    // through the venue conversion would shift it by the offset.
    const before = Date.now();
    const ics = buildIcs(ev);
    const stamp = /DTSTAMP:(\d{8}T\d{6})Z/.exec(ics)?.[1];
    expect(stamp).toBeDefined();
    const iso = stamp!.replace(
      /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/,
      "$1-$2-$3T$4:$5:$6Z",
    );
    // Within a minute of now, i.e. unconverted.
    expect(Math.abs(new Date(iso).getTime() - before)).toBeLessThan(60_000);
  });
});

describe("googleCalUrl", () => {
  it("encodes title and venue-converted dates", () => {
    const url = googleCalUrl(ev);
    expect(url).toContain("calendar.google.com");
    expect(url).toContain("text=Tech+Expo");
    expect(url).toContain("20260901T060000Z/20260901T140000Z");
  });
});

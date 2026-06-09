import { describe, it, expect } from "vitest";
import { buildIcs, googleCalUrl } from "@/lib/calendar/ics";

const ev = {
  title: "Tech Expo",
  start: "2026-09-01T09:00:00Z",
  end: "2026-09-01T17:00:00Z",
  location: "Beirut Forum",
  description: "Annual expo",
};

describe("buildIcs", () => {
  it("produces a VCALENDAR with summary and UTC dtstart", () => {
    const ics = buildIcs(ev);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics).toContain("SUMMARY:Tech Expo");
    expect(ics).toContain("DTSTART:20260901T090000Z");
    expect(ics).toContain("DTEND:20260901T170000Z");
    expect(ics).toContain("LOCATION:Beirut Forum");
  });
});

describe("googleCalUrl", () => {
  it("encodes title and dates", () => {
    const url = googleCalUrl(ev);
    expect(url).toContain("calendar.google.com");
    expect(url).toContain("text=Tech+Expo");
    expect(url).toContain("20260901T090000Z/20260901T170000Z");
  });
});

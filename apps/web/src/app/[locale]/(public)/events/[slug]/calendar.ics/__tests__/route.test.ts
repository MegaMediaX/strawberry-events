import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/events/public", () => ({ getPublicEvent: vi.fn() }));

import { getPublicEvent } from "@/lib/events/public";
import { GET } from "../route";

const mock = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

function req(slug: string) {
  return GET(new Request(`https://app/en/events/${slug}/calendar.ics`), {
    params: Promise.resolve({ slug }),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("calendar.ics route", () => {
  it("returns 404 for a non-public / hidden / draft event (no leak)", async () => {
    mock(getPublicEvent).mockResolvedValue(null);
    const res = await req("hidden-evt");
    expect(res.status).toBe(404);
  });

  it("serves an .ics with summary + location for a public event", async () => {
    mock(getPublicEvent).mockResolvedValue({
      event: { titleEn: "Demo Expo", descriptionEn: "Desc", venueName: "BIEL", city: "Beirut" },
      tickets: [],
      capacity: { sold: 0, total: null },
      dateFrom: "2026-09-01T09:00:00Z",
      dateTo: "2026-09-01T17:00:00Z",
    });
    const res = await req("demo-expo");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/calendar");
    expect(res.headers.get("content-disposition")).toContain("demo-expo.ics");
    const body = await res.text();
    expect(body).toContain("BEGIN:VCALENDAR");
    expect(body).toContain("SUMMARY:Demo Expo");
    expect(body).toContain("LOCATION:BIEL");
  });
});

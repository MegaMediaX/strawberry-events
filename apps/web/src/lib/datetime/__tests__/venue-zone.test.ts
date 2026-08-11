import { describe, it, expect } from "vitest";
import { venueWallClockToUtc, VENUE_IANA_ZONE } from "../uk";

/**
 * These are the assertions that would have caught the calendar bug: stored
 * session times are naive VENUE wall-clock, and anything leaving the app for an
 * external calendar has to become a real instant first.
 *
 * Note none of this depends on the runner's own zone — the conversion is driven
 * by the IANA database, not by ambient local time. That matters because CI runs
 * in UTC, where a broken implementation and a correct one are indistinguishable
 * if you compare against local-time helpers.
 */
describe("venueWallClockToUtc", () => {
  it("reads stored digits as venue time, not UTC", () => {
    // 09:30 at the venue on 28 Aug. Beirut is UTC+3 in August, so the real
    // instant is 06:30Z — emitting 09:30Z would put the event 3h late in every
    // attendee's calendar.
    const d = venueWallClockToUtc("2026-08-28T09:30:00.000Z");
    expect(d?.toISOString()).toBe("2026-08-28T06:30:00.000Z");
  });

  it("converts the event's closing time too", () => {
    const d = venueWallClockToUtc("2026-08-30T18:00:00.000Z");
    expect(d?.toISOString()).toBe("2026-08-30T15:00:00.000Z");
  });

  it("handles the workshop slot", () => {
    const d = venueWallClockToUtc("2026-08-28T16:00:00.000Z");
    expect(d?.toISOString()).toBe("2026-08-28T13:00:00.000Z");
  });

  it("follows DST rather than assuming a fixed offset", () => {
    // Beirut is UTC+3 in summer and UTC+2 in winter. A hardcoded +3 would put a
    // January event an hour out — the failure mode this test exists to prevent.
    const summer = venueWallClockToUtc("2026-08-28T12:00:00.000Z");
    const winter = venueWallClockToUtc("2026-01-28T12:00:00.000Z");
    expect(summer?.toISOString()).toBe("2026-08-28T09:00:00.000Z");
    expect(winter?.toISOString()).toBe("2026-01-28T10:00:00.000Z");
  });

  it("accepts the bare datetime-local shape", () => {
    expect(venueWallClockToUtc("2026-08-28T09:30")?.toISOString()).toBe(
      "2026-08-28T06:30:00.000Z",
    );
  });

  it("returns null on absent or unparseable input", () => {
    expect(venueWallClockToUtc(null)).toBeNull();
    expect(venueWallClockToUtc(undefined)).toBeNull();
    expect(venueWallClockToUtc("")).toBeNull();
    expect(venueWallClockToUtc("not a date")).toBeNull();
  });

  it("is a no-op when the venue zone is UTC", () => {
    expect(venueWallClockToUtc("2026-08-28T09:30:00.000Z", "UTC")?.toISOString()).toBe(
      "2026-08-28T09:30:00.000Z",
    );
  });

  it("works for a zone west of UTC", () => {
    // New York is UTC-4 in August: 09:30 local is 13:30Z. Guards against a sign
    // error that a Beirut-only test set would never expose.
    expect(
      venueWallClockToUtc("2026-08-28T09:30:00.000Z", "America/New_York")?.toISOString(),
    ).toBe("2026-08-28T13:30:00.000Z");
  });

  it("pins the venue zone to Beirut", () => {
    expect(VENUE_IANA_ZONE).toBe("Asia/Beirut");
  });
});

/**
 * DST boundaries. A single-pass offset derivation samples the offset at the
 * digits-read-as-UTC instant, which near a transition can fall on the far side
 * of the change — putting ORDINARY evening times on the preceding Saturday out
 * by an hour. These are not the ambiguous/nonexistent hour; they are normal
 * times that a single pass gets wrong.
 *
 * Beirut: forward last Sunday of March, back last Sunday of October.
 */
describe("venueWallClockToUtc across DST transitions", () => {
  const displaysAs = (d: Date, timeZone: string) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);

  const roundTrips = (wall: string) => {
    const d = venueWallClockToUtc(wall);
    expect(d).not.toBeNull();
    // The instant we produce must DISPLAY as the wall-clock we asked for.
    const shown = displaysAs(d!, VENUE_IANA_ZONE).replace(", ", "T").slice(0, 16);
    expect(shown).toBe(wall.slice(0, 16));
  };

  it("holds on the evening before the spring forward", () => {
    roundTrips("2026-03-28T22:00");
    roundTrips("2026-03-28T23:00");
    roundTrips("2026-03-28T23:30");
  });

  it("holds on the evening before the autumn back", () => {
    roundTrips("2026-10-24T21:00");
    roundTrips("2026-10-24T22:00");
    roundTrips("2026-10-24T22:59");
  });

  it("holds well clear of any transition", () => {
    roundTrips("2026-08-28T09:30");
    roundTrips("2026-08-30T18:00");
    roundTrips("2026-01-15T12:00");
  });
});

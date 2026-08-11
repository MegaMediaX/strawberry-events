import { describe, it, expect } from "vitest";
import { selectListIdForDate, venueToday } from "../select-list";

// The real shape: three conference days, three pretix check-in lists created in
// day order, plus a workshop sharing day one's date (so the helper has to
// deduplicate rather than count rows).
const DAYS = [
  { dateFrom: "2026-08-28T09:30:00.000Z" }, // Day One
  { dateFrom: "2026-08-28T16:00:00.000Z" }, // AI for HR — same date
  { dateFrom: "2026-08-29T09:30:00.000Z" }, // Day Two
  { dateFrom: "2026-08-30T09:30:00.000Z" }, // Day Three
];
const LISTS = [{ id: 1 }, { id: 2 }, { id: 3 }];

describe("selectListIdForDate", () => {
  it("picks each day's own list", () => {
    expect(selectListIdForDate(DAYS, LISTS, "2026-08-28")).toBe(1);
    expect(selectListIdForDate(DAYS, LISTS, "2026-08-29")).toBe(2);
    expect(selectListIdForDate(DAYS, LISTS, "2026-08-30")).toBe(3);
  });

  it("deduplicates sessions sharing a date", () => {
    // Four sessions, three dates, three lists. If the helper counted ROWS it
    // would see 4 vs 3, decide the pairing is untrustworthy and return null.
    expect(selectListIdForDate(DAYS, LISTS, "2026-08-29")).not.toBeNull();
    expect(selectListIdForDate(DAYS, LISTS, "2026-08-29")).toBe(2);
  });

  it("pairs by creation order even when the API returns lists out of order", () => {
    // pretix orders check-in lists by (subevent__date_from, name, pk). With no
    // subevents, NAME decides — so renaming "Day 1" to "Opening Day" reorders
    // the response. Taking that order verbatim would point day one at day two's
    // list and refuse every returning attendee the next morning.
    const asPretixWouldSort = [{ id: 2 }, { id: 3 }, { id: 1 }];
    expect(selectListIdForDate(DAYS, asPretixWouldSort, "2026-08-28")).toBe(1);
    expect(selectListIdForDate(DAYS, asPretixWouldSort, "2026-08-29")).toBe(2);
    expect(selectListIdForDate(DAYS, asPretixWouldSort, "2026-08-30")).toBe(3);
  });

  it("declines when a stray extra session date appears", () => {
    // An organiser adding a setup slot or a speaker dinner on a fourth date
    // makes the ordinal pairing meaningless. Returning null is correct — the
    // caller falls back and the page shows a warning rather than guessing.
    const withSetupDay = [{ dateFrom: "2026-08-27T18:00:00.000Z" }, ...DAYS];
    expect(selectListIdForDate(withSetupDay, LISTS, "2026-08-28")).toBeNull();
  });

  it("clamps to day one before the event (setup and rehearsal)", () => {
    expect(selectListIdForDate(DAYS, LISTS, "2026-08-10")).toBe(1);
    expect(selectListIdForDate(DAYS, LISTS, "2026-08-27")).toBe(1);
  });

  it("clamps to the final day afterwards (late reconciliation)", () => {
    expect(selectListIdForDate(DAYS, LISTS, "2026-08-31")).toBe(3);
    expect(selectListIdForDate(DAYS, LISTS, "2026-12-01")).toBe(3);
  });

  it("falls back to null when days and lists cannot be paired", () => {
    // A mismatched count makes the ordinal pairing meaningless. Better to defer
    // to the caller's default than to confidently pick the wrong day.
    expect(selectListIdForDate(DAYS, [{ id: 1 }, { id: 2 }], "2026-08-29")).toBeNull();
    expect(selectListIdForDate([], LISTS, "2026-08-29")).toBeNull();
  });

  it("returns null when there are no lists at all", () => {
    expect(selectListIdForDate(DAYS, [], "2026-08-28")).toBeNull();
  });

  it("short-circuits a single list without needing day data", () => {
    expect(selectListIdForDate([], [{ id: 7 }], "2026-08-28")).toBe(7);
  });

  it("uses the most recent started day across a gap", () => {
    const split = [
      { dateFrom: "2026-08-28T09:30:00.000Z" },
      { dateFrom: "2026-08-30T09:30:00.000Z" },
    ];
    // 29 Aug is a break day: keep yesterday's list rather than jumping ahead.
    expect(selectListIdForDate(split, [{ id: 1 }, { id: 2 }], "2026-08-29")).toBe(1);
  });

  it("accepts Date objects as well as ISO strings", () => {
    const asDates = DAYS.map((d) => ({ dateFrom: new Date(d.dateFrom) }));
    expect(selectListIdForDate(asDates, LISTS, "2026-08-30")).toBe(3);
  });
});

describe("venueToday", () => {
  it("reports the venue's date, not the server's", () => {
    // 22:30 UTC on the 27th is already the 28th in Beirut (UTC+3). A server
    // running UTC would open the wrong day's list for that half-hour.
    const lateOnThe27th = new Date("2026-08-27T22:30:00Z");
    expect(venueToday("Asia/Beirut", lateOnThe27th)).toBe("2026-08-28");
    expect(venueToday("UTC", lateOnThe27th)).toBe("2026-08-27");
  });

  it("is stable through the working day", () => {
    const morning = new Date("2026-08-28T06:00:00Z"); // 09:00 Beirut
    const evening = new Date("2026-08-28T15:00:00Z"); // 18:00 Beirut
    expect(venueToday("Asia/Beirut", morning)).toBe("2026-08-28");
    expect(venueToday("Asia/Beirut", evening)).toBe("2026-08-28");
  });
});

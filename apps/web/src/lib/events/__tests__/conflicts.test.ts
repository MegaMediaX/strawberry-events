import { describe, it, expect } from "vitest";
import {
  rangesOverlap,
  findConflicts,
  validateSelection,
  type SelectionSubEvent,
  type SelectionEventCaps,
} from "@/lib/events/conflicts";

// ---------------------------------------------------------------------------
// rangesOverlap
// ---------------------------------------------------------------------------
describe("rangesOverlap", () => {
  it("returns false when ranges do not overlap", () => {
    expect(
      rangesOverlap(
        { dateFrom: "2024-01-01T09:00:00Z", dateTo: "2024-01-01T10:00:00Z" },
        { dateFrom: "2024-01-01T11:00:00Z", dateTo: "2024-01-01T12:00:00Z" },
      ),
    ).toBe(false);
  });

  it("returns false when ranges are adjacent (a.end === b.start)", () => {
    expect(
      rangesOverlap(
        { dateFrom: "2024-01-01T09:00:00Z", dateTo: "2024-01-01T10:00:00Z" },
        { dateFrom: "2024-01-01T10:00:00Z", dateTo: "2024-01-01T11:00:00Z" },
      ),
    ).toBe(false);
  });

  it("returns true for a partial overlap", () => {
    expect(
      rangesOverlap(
        { dateFrom: "2024-01-01T09:00:00Z", dateTo: "2024-01-01T10:30:00Z" },
        { dateFrom: "2024-01-01T10:00:00Z", dateTo: "2024-01-01T11:00:00Z" },
      ),
    ).toBe(true);
  });

  it("returns true when one range is fully inside another", () => {
    expect(
      rangesOverlap(
        { dateFrom: "2024-01-01T09:00:00Z", dateTo: "2024-01-01T12:00:00Z" },
        { dateFrom: "2024-01-01T10:00:00Z", dateTo: "2024-01-01T11:00:00Z" },
      ),
    ).toBe(true);
  });

  it("returns true for identical ranges", () => {
    expect(
      rangesOverlap(
        { dateFrom: "2024-01-01T09:00:00Z", dateTo: "2024-01-01T10:00:00Z" },
        { dateFrom: "2024-01-01T09:00:00Z", dateTo: "2024-01-01T10:00:00Z" },
      ),
    ).toBe(true);
  });

  it("accepts Date objects", () => {
    const a = new Date("2024-01-01T09:00:00Z");
    const b = new Date("2024-01-01T09:30:00Z");
    const c = new Date("2024-01-01T10:00:00Z");
    expect(rangesOverlap({ dateFrom: a, dateTo: c }, { dateFrom: b, dateTo: c })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// findConflicts
// ---------------------------------------------------------------------------
describe("findConflicts", () => {
  const workshop: SelectionSubEvent = {
    id: "w1",
    titleEn: "Workshop A",
    category: "Workshop",
    pretixItemId: 1,
    ticketsPerUser: 1,
    dateFrom: "2024-01-01T09:00:00Z",
    dateTo: "2024-01-01T10:00:00Z",
  };
  const panel: SelectionSubEvent = {
    id: "p1",
    titleEn: "Panel B",
    category: "Workshop",
    pretixItemId: 2,
    ticketsPerUser: 1,
    dateFrom: "2024-01-01T10:00:00Z",
    dateTo: "2024-01-01T11:00:00Z",
  };
  const overlapping: SelectionSubEvent = {
    id: "o1",
    titleEn: "Overlap C",
    category: "Workshop",
    pretixItemId: 3,
    ticketsPerUser: 1,
    dateFrom: "2024-01-01T09:30:00Z",
    dateTo: "2024-01-01T10:30:00Z",
  };

  it("returns empty array when no conflicts", () => {
    expect(findConflicts(workshop, [panel])).toHaveLength(0);
  });

  it("returns the conflicting item", () => {
    const result = findConflicts(overlapping, [workshop]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("w1");
  });

  it("returns all conflicting items", () => {
    // overlapping (09:30–10:30) overlaps workshop (09:00–10:00) AND panel (10:00–11:00)
    // because 09:30 < 11:00 && 10:00 < 10:30
    const result = findConflicts(overlapping, [workshop, panel]);
    expect(result).toHaveLength(2);
    const ids = result.map((r) => r.id);
    expect(ids).toContain("w1");
    expect(ids).toContain("p1");
  });
});

// ---------------------------------------------------------------------------
// validateSelection
// ---------------------------------------------------------------------------

function makeEvent(overrides?: Partial<SelectionEventCaps>): SelectionEventCaps {
  return { ticketsPerUserMain: 1, ticketsPerUserTotal: 3, ...overrides };
}

function makeSubEvent(overrides?: Partial<SelectionSubEvent>): SelectionSubEvent {
  return {
    id: "se1",
    titleEn: "Workshop A",
    category: "Workshop",
    pretixItemId: 10,
    ticketsPerUser: 1,
    dateFrom: "2024-01-01T09:00:00Z",
    dateTo: "2024-01-01T10:00:00Z",
    ...overrides,
  };
}

describe("validateSelection", () => {
  it("passes when everything is within limits", () => {
    const se = makeSubEvent();
    expect(() =>
      validateSelection(makeEvent(), [se], [{ itemId: 10, quantity: 1 }]),
    ).not.toThrow();
  });

  it("throws when per-sub-event cap is exceeded", () => {
    const se = makeSubEvent({ ticketsPerUser: 1 });
    expect(() =>
      validateSelection(makeEvent({ ticketsPerUserTotal: 5 }), [se], [{ itemId: 10, quantity: 2 }]),
    ).toThrow(/cannot select more than 1 ticket/i);
  });

  it("throws when main ticket cap is exceeded", () => {
    expect(() =>
      validateSelection(makeEvent({ ticketsPerUserMain: 1 }), [], [{ itemId: 99, quantity: 2 }]),
    ).toThrow(/cannot select more than 1 main ticket/i);
  });

  it("throws when total cap is exceeded", () => {
    // ticketsPerUser allows 2, but ticketsPerUserTotal allows only 1
    const se = makeSubEvent({ ticketsPerUser: 2 });
    expect(() =>
      validateSelection(
        makeEvent({ ticketsPerUserTotal: 1, ticketsPerUserMain: 5 }),
        [se],
        [{ itemId: 10, quantity: 2 }],
      ),
    ).toThrow(/cannot select more than 1 total ticket/i);
  });

  it("throws on time conflict between two sub-events", () => {
    const se1 = makeSubEvent({
      id: "se1",
      titleEn: "Workshop A",
      pretixItemId: 10,
      dateFrom: "2024-01-01T09:00:00Z",
      dateTo: "2024-01-01T10:30:00Z",
    });
    const se2 = makeSubEvent({
      id: "se2",
      titleEn: "Panel B",
      pretixItemId: 11,
      dateFrom: "2024-01-01T10:00:00Z",
      dateTo: "2024-01-01T11:00:00Z",
    });
    expect(() =>
      validateSelection(
        makeEvent({ ticketsPerUserTotal: 5 }),
        [se1, se2],
        [
          { itemId: 10, quantity: 1 },
          { itemId: 11, quantity: 1 },
        ],
      ),
    ).toThrow(/time conflict/i);
  });

  it("does not throw for adjacent (non-overlapping) sub-events", () => {
    const se1 = makeSubEvent({
      id: "se1",
      pretixItemId: 10,
      dateFrom: "2024-01-01T09:00:00Z",
      dateTo: "2024-01-01T10:00:00Z",
    });
    const se2 = makeSubEvent({
      id: "se2",
      pretixItemId: 11,
      titleEn: "Panel B",
      dateFrom: "2024-01-01T10:00:00Z",
      dateTo: "2024-01-01T11:00:00Z",
    });
    expect(() =>
      validateSelection(
        makeEvent({ ticketsPerUserTotal: 5 }),
        [se1, se2],
        [
          { itemId: 10, quantity: 1 },
          { itemId: 11, quantity: 1 },
        ],
      ),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Conflict scoping by category
//
// An all-day container pass ("Day One", 09:30-18:30) is not a competing
// session. Booking the day pass AND a workshop running inside it is the
// intended behaviour — before this scoping, the day pass blocked every session
// on its own day, which silently made those sessions unbookable.
// ---------------------------------------------------------------------------
describe("validateSelection — conflict scoping by category", () => {
  const dayPass: SelectionSubEvent = {
    id: "day1",
    titleEn: "Day One",
    category: "DAYS",
    pretixItemId: 5,
    ticketsPerUser: 1,
    dateFrom: "2026-08-28T09:30:00Z",
    dateTo: "2026-08-28T18:30:00Z",
  };
  const workshop: SelectionSubEvent = {
    id: "ai-hr",
    titleEn: "AI for HR",
    category: "Workshop",
    pretixItemId: 9,
    ticketsPerUser: 1,
    dateFrom: "2026-08-28T16:00:00Z",
    dateTo: "2026-08-28T17:00:00Z",
  };

  it("allows a day pass together with a workshop running inside it", () => {
    expect(() =>
      validateSelection(
        makeEvent({ ticketsPerUserMain: 1, ticketsPerUserTotal: 6 }),
        [dayPass, workshop],
        [
          { itemId: 5, quantity: 1 },
          { itemId: 9, quantity: 1 },
        ],
      ),
    ).not.toThrow();
  });

  it("order of selection does not matter", () => {
    expect(() =>
      validateSelection(
        makeEvent({ ticketsPerUserMain: 1, ticketsPerUserTotal: 6 }),
        [dayPass, workshop],
        [
          { itemId: 9, quantity: 1 },
          { itemId: 5, quantity: 1 },
        ],
      ),
    ).not.toThrow();
  });

  it("still blocks two overlapping sessions in the SAME category", () => {
    const clashing: SelectionSubEvent = {
      ...workshop,
      id: "other",
      titleEn: "Other Workshop",
      pretixItemId: 12,
      dateFrom: "2026-08-28T16:30:00Z",
      dateTo: "2026-08-28T17:30:00Z",
    };
    expect(() =>
      validateSelection(
        makeEvent({ ticketsPerUserMain: 1, ticketsPerUserTotal: 6 }),
        [workshop, clashing],
        [
          { itemId: 9, quantity: 1 },
          { itemId: 12, quantity: 1 },
        ],
      ),
    ).toThrow(/Time conflict/);
  });

  it("still blocks two overlapping day passes", () => {
    const overlappingDay: SelectionSubEvent = {
      ...dayPass,
      id: "day1b",
      titleEn: "Day One (dup)",
      pretixItemId: 6,
      dateFrom: "2026-08-28T12:00:00Z",
      dateTo: "2026-08-28T20:00:00Z",
    };
    expect(() =>
      validateSelection(
        makeEvent({ ticketsPerUserMain: 1, ticketsPerUserTotal: 6 }),
        [dayPass, overlappingDay],
        [
          { itemId: 5, quantity: 1 },
          { itemId: 6, quantity: 1 },
        ],
      ),
    ).toThrow(/Time conflict/);
  });
});

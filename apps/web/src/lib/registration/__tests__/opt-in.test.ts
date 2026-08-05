import { describe, it, expect } from "vitest";
import {
  gatedCategories,
  visibleSubEvents,
  pruneSelection,
} from "@/lib/registration/opt-in";

const days = [
  { category: "Days", requiresOptIn: false, pretixItemId: 1 },
  { category: "Days", requiresOptIn: false, pretixItemId: 2 },
];
const workshops = [
  { category: "Workshops", requiresOptIn: true, pretixItemId: 10 },
  { category: "Workshops", requiresOptIn: true, pretixItemId: 11 },
];
const all = [...days, ...workshops];

describe("gatedCategories", () => {
  it("returns only categories that require opt-in", () => {
    expect(gatedCategories(all)).toEqual(["Workshops"]);
  });

  it("dedupes and preserves first-appearance order", () => {
    expect(
      gatedCategories([
        { category: "Workshops", requiresOptIn: true, pretixItemId: 1 },
        { category: "Labs", requiresOptIn: true, pretixItemId: 2 },
        { category: "Workshops", requiresOptIn: true, pretixItemId: 3 },
      ]),
    ).toEqual(["Workshops", "Labs"]);
  });

  it("gates the whole category when only one member sets the flag", () => {
    const mixed = [
      { category: "Workshops", requiresOptIn: true, pretixItemId: 10 },
      { category: "Workshops", requiresOptIn: false, pretixItemId: 11 },
    ];
    expect(gatedCategories(mixed)).toEqual(["Workshops"]);
    expect(visibleSubEvents(mixed, [])).toEqual([]);
  });

  it("returns nothing when no category is gated", () => {
    expect(gatedCategories(days)).toEqual([]);
  });
});

describe("visibleSubEvents", () => {
  it("hides gated categories until opted in", () => {
    expect(visibleSubEvents(all, [])).toEqual(days);
  });

  it("reveals the gated category once opted in", () => {
    expect(visibleSubEvents(all, ["Workshops"])).toEqual(all);
  });

  it("always shows ungated categories", () => {
    expect(visibleSubEvents(days, [])).toEqual(days);
  });

  it("ignores an opt-in for a category that isn't gated", () => {
    expect(visibleSubEvents(days, ["Workshops"])).toEqual(days);
  });
});

describe("pruneSelection", () => {
  it("drops selections whose session is no longer visible", () => {
    const selection = [
      { itemId: 1, quantity: 1 },
      { itemId: 10, quantity: 1 },
    ];
    // Un-ticked "Workshops" → only the Days sessions remain visible.
    expect(pruneSelection(selection, visibleSubEvents(all, []))).toEqual([
      { itemId: 1, quantity: 1 },
    ]);
  });

  it("keeps everything while the category is still opted in", () => {
    const selection = [
      { itemId: 1, quantity: 1 },
      { itemId: 10, quantity: 1 },
    ];
    expect(pruneSelection(selection, visibleSubEvents(all, ["Workshops"]))).toEqual(
      selection,
    );
  });

  it("ignores sessions with no pretix item", () => {
    expect(
      pruneSelection(
        [{ itemId: 5, quantity: 1 }],
        [{ category: "Days", requiresOptIn: false, pretixItemId: null }],
      ),
    ).toEqual([]);
  });
});

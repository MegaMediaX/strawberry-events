import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { SeatSelector, isSeatSelectable, type SectionNode } from "../seat-selector";

const sections: SectionNode[] = [
  {
    id: "sec-1",
    name: "Stalls",
    rows: [
      {
        id: "row-b",
        label: "B",
        seats: [
          { id: "b1", label: "1", state: "available" },
          { id: "b2", label: "2", state: "accessible" },
          { id: "b3", label: "3", state: "sold_or_reserved" },
          { id: "b4", label: "4", state: "temporarily_held" },
        ],
      },
    ],
  },
];

const render = (required: number, value: string[] = []) =>
  renderToStaticMarkup(
    <SeatSelector
      sections={sections}
      value={value}
      onChange={() => {}}
      required={required}
    />,
  );

describe("every seat is named, not just coloured", () => {
  // The map used to carry its state in fill colour and a `title` attribute,
  // which most screen readers never announce — a run of unlabelled buttons.
  it("announces row, seat and state", () => {
    const html = render(2);
    expect(html).toContain('aria-label="Row B seat 1, available"');
    expect(html).toContain('aria-label="Row B seat 2, step-free access, available"');
    expect(html).toContain('aria-label="Row B seat 3, taken"');
    expect(html).toContain('aria-label="Row B seat 4, held by someone else"');
  });

  it("disables the seats that cannot be chosen", () => {
    const html = render(2);
    // Both unavailable seats are disabled; the two free ones are not.
    expect(html.match(/disabled=""/g)).toHaveLength(2);
  });

  it("names every state in the legend, including step-free", () => {
    const html = render(2);
    for (const legend of [
      "Available",
      "Step-free (dashed edge)",
      "Held by someone else",
      "Taken (struck through)",
      "Not for sale (struck through)",
    ]) {
      expect(html).toContain(legend);
    }
  });
});

describe("the map says how many seats the order needs", () => {
  it("asks for one seat per ticket", () => {
    expect(render(2)).toContain("Select 2 seats — 0 chosen.");
    expect(render(1)).toContain("Select 1 seat — 0 chosen.");
  });

  it("points back to the tickets when none is chosen yet", () => {
    expect(render(0)).toContain("Choose your tickets first");
  });
});

describe("the map shows the seats the form actually holds", () => {
  // It kept its own copy, and it unmounts whenever the wizard leaves the
  // Tickets step — so coming Back from Confirm drew an empty map and "0
  // chosen" over a selection the form still held and still validated against.
  it("renders a selection it was handed, with the count to match", () => {
    const html = render(2, ["b1"]);
    expect(html).toContain("Select 2 seats — 1 chosen.");
    expect(html).toContain('aria-label="Row B seat 1, selected"');
  });

  it("stops offering more seats once the order is full", () => {
    const html = render(1, ["b1"]);
    // The chosen seat stays pressable (to give it up); the other free one does
    // not, because taking it would exceed the ticket count.
    expect(html).toContain('aria-label="Row B seat 1, selected"');
    expect(html.match(/disabled=""/g)).toHaveLength(3);
  });
});

describe("isSeatSelectable", () => {
  it("offers available and accessible seats only", () => {
    expect(isSeatSelectable("available")).toBe(true);
    expect(isSeatSelectable("accessible")).toBe(true);
    expect(isSeatSelectable("temporarily_held")).toBe(false);
    expect(isSeatSelectable("sold_or_reserved")).toBe(false);
    expect(isSeatSelectable("blocked")).toBe(false);
  });

  it("treats an unknown state as unavailable rather than free", () => {
    expect(isSeatSelectable("some_future_state")).toBe(false);
  });
});

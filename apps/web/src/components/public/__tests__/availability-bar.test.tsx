import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { AvailabilityBar } from "../availability-bar";

const render = (sold: number, total: number | null) =>
  renderToStaticMarkup(<AvailabilityBar sold={sold} total={total} />);

describe("the bar only draws progress it actually has", () => {
  // It used to fill to a hardcoded 8% and report aria-valuenow="8" under
  // "Open registration" — a scarcity signal derived from nothing.
  it("draws no bar at all when capacity is unknown", () => {
    const html = render(40, null);
    expect(html).not.toContain('role="progressbar"');
    expect(html).toContain("Open registration");
  });

  it("draws the real proportion when capacity is known", () => {
    const html = render(50, 200);
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="25"');
  });
});

describe("the bar is readable without seeing it", () => {
  it("carries a name and states its value in words", () => {
    const html = render(190, 200);
    expect(html).toContain('aria-label="Tickets sold"');
    expect(html).toContain('aria-valuetext="Almost full — 10 left"');
  });

  it("does not pulse for someone who asked for less motion", () => {
    // "almost full" is the only animated state; the width transition beside it
    // was already guarded, this was not.
    expect(render(190, 200)).toContain("motion-reduce:animate-none");
  });
});

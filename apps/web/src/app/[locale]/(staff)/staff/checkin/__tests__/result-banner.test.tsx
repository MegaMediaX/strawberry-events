import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { ResultBanner } from "../result-banner";

describe("the banner's idle space", () => {
  // That area was the largest element on the screen and blank between every
  // attendee, while the list of people just checked in — and the only route to
  // Fix — sat below the fold on a 768px laptop.
  it("shows the idle content instead of the placeholder when there is some", () => {
    const html = renderToStaticMarkup(
      <ResultBanner result={null} idle={<p>Just now: Elias Daou</p>} />,
    );
    expect(html).toContain("Just now: Elias Daou");
    expect(html).not.toContain("Scan a badge or ticket");
  });

  it("falls back to the prompt when there is nothing to show yet", () => {
    // First thing in the morning, before anyone has been checked in.
    const html = renderToStaticMarkup(<ResultBanner result={null} />);
    expect(html).toContain("Scan a badge or ticket");
  });

  it("yields the space entirely once something happens", () => {
    const html = renderToStaticMarkup(
      <ResultBanner
        result={{ kind: "ok", name: "Elias Daou", detail: "Badge printed" }}
        idle={<p>Just now: someone else</p>}
      />,
    );
    expect(html).toContain("Elias Daou");
    expect(html).not.toContain("someone else");
  });
});

describe("Fix on the person the banner names", () => {
  it("offers Fix when the result carries an order code", () => {
    const html = renderToStaticMarkup(
      <ResultBanner
        result={{ kind: "ok", name: "Elias Daou", detail: "Badge printed", orderCode: "B7TLU" }}
        onFix={() => {}}
      />,
    );
    expect(html).toContain("Fix details");
  });

  it("offers nothing when there is no order code to act on", () => {
    // e.g. the test badge, or a failure that never resolved to an order.
    const html = renderToStaticMarkup(
      <ResultBanner result={{ kind: "ok", name: "Test Badge", detail: "Badge printed" }} onFix={() => {}} />,
    );
    expect(html).not.toContain("Fix details");
  });

  it("offers nothing when the screen has no handler wired", () => {
    const html = renderToStaticMarkup(
      <ResultBanner result={{ kind: "ok", name: "X", detail: "d", orderCode: "B7TLU" }} />,
    );
    expect(html).not.toContain("Fix details");
  });

  it("is offered on a warning too — a reprint is exactly when you reread a badge", () => {
    const html = renderToStaticMarkup(
      <ResultBanner
        result={{ kind: "warn", name: "X", detail: "d", orderCode: "B7TLU" }}
        onFix={() => {}}
      />,
    );
    expect(html).toContain("Fix details");
  });

  it("never offers it on an error — there is no confirmed person to correct", () => {
    const html = renderToStaticMarkup(
      <ResultBanner result={{ kind: "err", name: "X", detail: "d" }} onFix={() => {}} />,
    );
    expect(html).not.toContain("Fix details");
  });
});

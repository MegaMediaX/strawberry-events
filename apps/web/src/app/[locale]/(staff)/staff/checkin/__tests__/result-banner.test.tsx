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

describe("what the outcome says, and how loudly", () => {
  const render = (r: Parameters<typeof ResultBanner>[0]["result"]) =>
    renderToStaticMarkup(<ResultBanner result={r} />);

  it("uses words that do not rhyme with each other", () => {
    // "Checked in" / "Already in" / "Not checked in" all end in the same
    // morpheme, and the only thing separating the refusal from the admission
    // was the word "Not", in the smallest type on the screen. A tired
    // second-language reader at arm's length reads word SHAPE, not letters.
    const ok = render({ kind: "ok", name: "X", detail: "d" });
    const err = render({ kind: "err", name: "X", detail: "d" });
    expect(ok).toContain("ENTER");
    expect(err).toContain("STOP");
    expect(err).not.toContain("ENTER");
  });

  it("fills the banner with solid colour, not a tint that vanishes in glare", () => {
    expect(render({ kind: "ok", name: "X", detail: "d" })).toContain("bg-green-700");
    expect(render({ kind: "err", name: "X", detail: "d" })).toContain("bg-destructive");
    for (const kind of ["ok", "warn", "err"] as const) {
      expect(render({ kind, name: "X", detail: "d" })).not.toMatch(/bg-[a-z-]+\/12/);
    }
  });

  it("still lets a reprint say so, rather than reading as a fresh admission", () => {
    expect(render({ kind: "ok", name: "X", detail: "d", label: "Reprinted" })).toContain("Reprinted");
  });

  it("keeps the idle content out of the assertive live region", () => {
    // Inside it, with aria-atomic, every return to idle re-announced the whole
    // recent list — once per attendee, interrupting whatever was being read.
    const html = renderToStaticMarkup(<ResultBanner result={null} idle={<p>Just now</p>} />);
    expect(html).not.toContain("aria-live");
    expect(html).toContain("Just now");
  });

  it("announces a real outcome assertively", () => {
    expect(render({ kind: "ok", name: "X", detail: "d" })).toContain('aria-live="assertive"');
  });
});

import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { EventHero } from "../event-hero";

/**
 * The event page's feature.
 *
 * Two claims this file exists to hold. The crop is now a DECISION — the hero
 * cropped every non-16:6 cover from the centre and said in a comment that it
 * never cropped at all, so the picture's subject survived by luck. And the
 * title is a title card: the most important headline in the product was set in
 * the heavy sans, on a band inside a 1024px column, because Instrument Serif
 * ships weight 400 only and nobody wrote that down.
 */
const render = (props: Partial<Parameters<typeof EventHero>[0]> = {}) =>
  renderToStaticMarkup(
    <EventHero
      title="The Beirut Hospitality Forum"
      dateLabel="28 Aug 2026, 09:00"
      locationLabel="Le Royal Hotel Beirut"
      statusLabel="Open"
      coverUrl="https://cdn.example.com/cover.jpg"
      {...props}
    />,
  );

describe("the event hero", () => {
  it("sets the event's name as the page's h1, in the display face", () => {
    const html = render();
    expect(html).toMatch(/<h1[^>]*font-heading[^>]*>The Beirut Hospitality Forum<\/h1>/);
  });

  it.each([
    ["Summit", 1],
    ["The Beirut Hospitality & Culinary Forum 2026", 2],
    ["Annual General Assembly of the Lebanese Franchise Association", 3],
  ])("sizes %s from the house scale, not its own pixels", (title, step) => {
    expect(render({ title })).toContain(`font-size:var(--display-${step})`);
  });

  /**
   * The whole point of Stage 2. A 3:4 poster keeps 28% of its height in this
   * frame; which 28% is the organiser's call, and it has to reach the image.
   */
  it("applies the organiser's crop", () => {
    expect(render({ focusX: 65, focusY: 10 })).toContain("object-position:65% 10%");
  });

  it("centres when no crop was ever chosen — the old behaviour, exactly", () => {
    expect(render({ focusX: null, focusY: null })).toContain("object-position:50% 50%");
  });

  it("never shows the cover without the scrim and the vignette over it", () => {
    const html = render();
    expect(html).toContain("var(--scrim-cinema)");
    expect(html).toContain("var(--vignette)");
    expect(html.indexOf("cover.jpg")).toBeLessThan(html.indexOf("var(--scrim-cinema)"));
  });

  /** White at 85% over the worst-case scrimmed pixel is 3.95:1. */
  it("sets no translucent type over the artwork", () => {
    expect(render()).not.toMatch(/text-white\/\d/);
  });

  it("keeps the status badge exactly as it was — it already solved this", () => {
    const html = render({ statusLabel: "Sold out" });
    expect(html).toContain("bg-black/75");
    expect(html).toContain("Sold out");
  });

  /** The badge is pinned to the frame, so it has to paint above the picture. */
  it("keeps the badge above the cover", () => {
    expect(render()).toMatch(/class="absolute end-4 top-4 z-10/);
  });

  it("marks the cover as the page's LCP element, and hides it from readers", () => {
    const html = render();
    expect(html).toMatch(/<img[^>]+alt=""/);
    expect(html).toMatch(/<img[^>]+fetchpriority="high"/i);
  });

  it("still renders the frame, the title and the badge with no cover at all", () => {
    const html = render({ coverUrl: null });
    expect(html).toContain("var(--gradient-hero-strong)");
    expect(html).toContain("var(--scrim-cinema)");
    expect(html).toContain("<h1");
    expect(html).toContain("Open");
  });

  it("survives an event with neither a date nor a venue", () => {
    const html = render({ dateLabel: null, locationLabel: null });
    expect(html).toContain("The Beirut Hospitality Forum");
    expect(html).not.toContain("Le Royal");
  });

  /**
   * The hero used to open at `opacity: 0` and be faded in by framer-motion. On
   * the element that is now the page's largest paint that means the whole
   * feature is an empty hole until the bundle lands — and stays one if it
   * never does. Caught by screenshotting the built page; the markup alone
   * looked fine.
   */
  it("is painted by the server, not by a script that has to arrive first", () => {
    const html = render();
    expect(html).not.toMatch(/opacity:\s*0/);
    expect(html).not.toMatch(/translateY/);
  });

  /** Shared with the index plate: one composition, one contrast contract. */
  it("uses the house frame rather than a second copy of it", () => {
    expect(render()).toContain("aspect-[var(--aspect-cinema)]");
    expect(render()).toContain("pt-[var(--scrim-fade)]");
  });
});

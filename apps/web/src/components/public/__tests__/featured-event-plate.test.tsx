import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { FeaturedEventPlate } from "../featured-event-plate";
import type { EventCardData } from "../event-card";

/**
 * The opening shot puts type over an admin-uploaded photograph, which is the
 * one composition the rest of this product deliberately avoids: every other
 * surface sets its text on a token whose contrast can be computed. Here the
 * ground is unknown, so three structural properties carry it, and each is
 * asserted rather than reviewed.
 *
 * The contrast arithmetic itself lives in app/__tests__/token-contrast.test.ts,
 * which proves the scrim token's own floor. This file proves the plate cannot
 * be rendered without it.
 */
const EVENT: EventCardData = {
  slug: "strawberry-summit",
  titleEn: "Strawberry Summit",
  titleAr: "قمة الفراولة",
  visibility: "public",
  comingSoon: false,
  coverUrl: "https://cdn.example.com/cover.jpg",
  metaLine: "28—30 Aug 2026 · Le Royal Hotel Beirut",
};

const render = (event: Partial<EventCardData> = {}, locale = "en") =>
  renderToStaticMarkup(<FeaturedEventPlate locale={locale} event={{ ...EVENT, ...event }} />);

describe("the featured plate's frame", () => {
  it("is the page's title card — the event title is the h1", () => {
    expect(render()).toContain("<h1");
    expect(/<h1[^>]*>Strawberry Summit<\/h1>/.test(render())).toBe(true);
  });

  it("never shows a cover without the scrim over it", () => {
    const html = render();
    expect(html).toContain("cover.jpg");
    expect(html).toContain("var(--scrim-cinema)");
    expect(html).toContain("var(--vignette)");
    // The scrim must come after the image in paint order, or it is behind it.
    expect(html.indexOf("cover.jpg")).toBeLessThan(html.indexOf("var(--scrim-cinema)"));
  });

  /**
   * The scrim is on the text block, and the block's top padding is the length
   * over which the scrim fades out. If the padding grows past the fade, type
   * moves up into the part of the gradient that is below the floor and goes
   * illegible on a pale cover — silently, and only on pale covers. One token
   * spends both, so the element carrying the gradient must carry the padding.
   */
  it("pads the scrimmed block by exactly the scrim's own fade", () => {
    const html = render();
    const block = /<div class="([^"]*)"[^>]*style="background-image:var\(--scrim-cinema\)/.exec(
      html,
    );
    expect(block, "no element carries --scrim-cinema").not.toBeNull();
    expect(block![1]).toContain("pt-[var(--scrim-fade)]");
  });

  /**
   * The block hugs the bottom of the frame. Stretched to the full cell it is
   * the frame-wide blanket this design rejected — same pixels under the text,
   * and the cover erased above it.
   */
  it("lets the scrimmed block hug the foot of the frame", () => {
    expect(/<div class="[^"]*self-end[^"]*"[^>]*style="background-image:var\(--scrim-cinema\)/
      .test(render())).toBe(true);
  });

  it("keeps the scrim when there is no cover at all", () => {
    const html = render({ coverUrl: null });
    expect(html).toContain("var(--gradient-hero-strong)");
    expect(html).toContain("var(--scrim-cinema)");
  });

  /**
   * White at 85% over the worst-case scrimmed pixel is 3.95:1 — under the
   * floor. Every other surface can afford a translucent secondary tone because
   * its ground is a known token; this one cannot, and the failure would be
   * invisible on any cover that happens to be dark.
   */
  it("sets no translucent text over the artwork", () => {
    const html = render();
    expect(html).toContain("text-white");
    expect(html).not.toMatch(/text-white\/\d/);
  });

  it("is one link, not a link inside a link", () => {
    const html = render();
    expect(html.match(/<a\s/g)).toHaveLength(1);
    expect(html).toContain('href="/en/events/strawberry-summit"');
    // The action is a span for exactly that reason.
    expect(html).toContain("View event and register");
  });

  it("marks the cover as the index's LCP element and leaves it out of the a11y tree", () => {
    const html = render();
    expect(html).toMatch(/<img[^>]+alt=""/);
    expect(html).toMatch(/<img[^>]+loading="eager"/);
    expect(html).toMatch(/<img[^>]+fetchpriority="high"/i);
  });

  it("carries the meta line, and survives an event that has none", () => {
    expect(render()).toContain("Le Royal Hotel Beirut");
    expect(render({ metaLine: null })).not.toContain("Le Royal");
  });

  it("uses the house frame, not its own ratio", () => {
    expect(render()).toContain("aspect-[var(--aspect-cinema)]");
  });

  /**
   * A weak guard for a bug only a browser could show: the ratio spacer's width
   * is derived from its min-height, so in an AUTO grid column it made the cell
   * 640px wide inside a 390px phone and the headline's second half was clipped
   * away behind overflow-hidden — silently. grid-cols-1 gives the cell a zero
   * minimum. Asserting the class cannot prove the layout; it does put the
   * reason in front of whoever deletes it next.
   */
  it("keeps the grid cell shrinkable", () => {
    expect(render()).toContain("grid-cols-1");
  });

  /**
   * Measured in Chromium at 1280px: the 78-character title below ran to five
   * 88px lines at a fixed display-1 and took the frame to 1.94:1 — a wall of
   * type, not a widescreen plate. Stepping the size down by title length put
   * it back to two lines at 2.67:1. The steps are house tokens, never a
   * computed size.
   */
  it.each([
    ["Summit", 1],
    ["Strawberry Summit", 1],
    ["The Beirut Hospitality & Culinary Forum 2026", 2],
    ["Annual General Assembly of the Lebanese Franchise Association and Awards Night", 3],
  ])("sizes %s at display-%i", (titleEn, step) => {
    expect(render({ titleEn })).toContain(`font-size:var(--display-${step})`);
  });

  /**
   * The frame's own top edge is unscrimmed picture and may be white, so a
   * single white indicator there is not guaranteed to be visible. The pair is.
   */
  it("gives focus a two-tone indicator, since the ground is unknown", () => {
    const html = render();
    expect(html).toContain("focus-visible:shadow-[inset_0_0_0_4px_#ffffff,inset_0_0_0_8px_#111111]");
  });

  it("still resolves the Arabic title if that locale is ever restored", () => {
    expect(render({}, "ar")).toContain("قمة الفراولة");
  });
});

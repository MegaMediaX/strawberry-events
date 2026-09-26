import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { FeaturedEventPlate } from "../featured-event-plate";
import type { EventCardData } from "../event-card";

/**
 * The opening shot shows the organiser's poster WHOLE and sets the site's
 * title below it, never on top of it.
 *
 * This file used to assert the opposite composition — type over the artwork,
 * held legible by a scrim, the cover cropped to a focal point in a 16/6 frame.
 * That design was retired by decision: posters carry their own headline,
 * dates and venue, so the overlay put every fact on screen twice with the two
 * headlines colliding. The scrim contract those tests guarded no longer exists
 * here (it still guards the event page's hero, which uses CinemaFrame).
 */
const EVENT: EventCardData = {
  slug: "strawberry-summit",
  titleEn: "Strawberry Summit",
  titleAr: "قمة الفراولة",
  visibility: "public",
  comingSoon: false,
  coverUrl: "https://cdn.example.com/cover.jpg",
  metaLine: "28—30 Aug 2026 · Le Royal Hotel Beirut",
  coverWidth: 1600,
  coverHeight: 900,
};

const render = (event: Partial<EventCardData> = {}, locale = "en") =>
  renderToStaticMarkup(<FeaturedEventPlate locale={locale} event={{ ...EVENT, ...event }} />);

describe("the featured plate", () => {
  it("is the page's title card — the event title is the h1", () => {
    expect(/<h1[^>]*>Strawberry Summit<\/h1>/.test(render())).toBe(true);
  });

  it("sets the title BELOW the poster, not over it", () => {
    const html = render();
    // Document order is paint order here: nothing is positioned over the
    // image, so the title coming after it means it sits beneath it.
    expect(html.indexOf("cover.jpg")).toBeLessThan(html.indexOf("<h1"));
    expect(html).not.toMatch(/absolute inset-0/);
  });

  it("puts no scrim and no white type on the artwork", () => {
    // Both only exist to make type legible over an unknown picture. Their
    // presence would mean the overlay composition had come back.
    const html = render();
    expect(html).not.toContain("--scrim-cinema");
    expect(html).not.toContain("text-white");
  });

  const box = (html: string) => /<div class="paper-edge[^"]*" style="([^"]*)"/.exec(html)![1];

  it("never crops the poster", () => {
    const img = /<img[^>]*>/.exec(render())![0];
    expect(img).not.toContain("object-cover");
    expect(img).not.toContain("object-position");
    // Contained, in a box of the poster's own shape: edge to edge, nothing cut.
    expect(img).toContain("object-contain");
    expect(box(render())).toContain("aspect-ratio:1600 / 900");
  });

  /**
   * THE thing that stops the page jumping — and the lesson of this file's
   * first draft. That draft asserted width/height ATTRIBUTES on the <img>. They
   * were present, the test passed, and the page still shifted by 0.22 on load:
   * `width: auto` overrides them, so the box had no size until the pixels
   * arrived. A test of the attribute proved nothing. The box's own
   * aspect-ratio is what holds the space, so that is what is asserted.
   */
  it("reserves the poster's space before it loads, from the recorded size", () => {
    expect(box(render())).toContain("aspect-ratio:1600 / 900");
  });

  it("sizes the poster to leave the title and button on screen", () => {
    // Measured at 1440x900: with the title below, an unbudgeted poster put the
    // button at 918px — below the fold. The width follows from a height budget
    // that pays for the title block first.
    const style = box(render());
    expect(style).toContain("100svh - 25rem");
    expect(style).toContain("* 1.7778"); // 1600 / 900
  });

  it("gives a portrait poster its own, narrower box", () => {
    const style = box(render({ coverWidth: 1080, coverHeight: 1350 }));
    expect(style).toContain("aspect-ratio:1080 / 1350");
    expect(style).toContain("* 0.8");
  });

  it("still holds space for a cover uploaded before sizes were recorded", () => {
    // No recorded size: a 16/9 box with the poster contained in it —
    // letterboxed if it is another shape, but never cropped and never shifting.
    const html = render({ coverWidth: null, coverHeight: null });
    expect(box(html)).toContain("aspect-ratio:16 / 9");
    const img = /<img[^>]*>/.exec(html)![0];
    expect(img).toContain("object-contain");
    // And it does not pretend to know the image's size.
    expect(img).not.toMatch(/\swidth=/);
  });

  it("marks the poster as the index's LCP element and leaves it out of the a11y tree", () => {
    const img = /<img[^>]*>/.exec(render())![0];
    expect(img).toContain('alt=""');
    expect(img).toContain('loading="eager"');
    expect(img).toMatch(/fetchpriority="high"/i);
  });

  it("is one link, not a link inside a link", () => {
    const html = render();
    expect(html.match(/<a\s/g)).toHaveLength(1);
    expect(html).toContain('href="/en/events/strawberry-summit"');
    expect(html).toContain("View event and register");
  });

  it("keeps its only red on the action", () => {
    // Red means "act here" — the decision for the whole palette. On this
    // surface that is the button and nothing else.
    const html = render();
    expect(html.match(/bg-primary(?![\w/-])/g)).toHaveLength(1);
    expect(html).toMatch(/<span class="paper-press[^"]*bg-primary/);
  });

  it("carries the meta line, and survives an event that has none", () => {
    expect(render()).toContain("Le Royal Hotel Beirut");
    expect(render({ metaLine: null })).not.toContain("Le Royal");
  });

  it("falls back to a plain plate when there is no cover, title still below", () => {
    const html = render({ coverUrl: null });
    expect(html).not.toContain("<img");
    expect(html).toContain("var(--gradient-hero-strong)");
    expect(html.indexOf("gradient-hero-strong")).toBeLessThan(html.indexOf("<h1"));
  });

  /**
   * Measured in Chromium at 1280px: a 78-character title ran to five 88px
   * lines at a fixed display-1. Stepping the size down by title length keeps
   * it to a readable block. The steps are house tokens, never a computed size.
   */
  it.each([
    ["Summit", 1],
    ["Strawberry Summit", 1],
    ["The Beirut Hospitality & Culinary Forum 2026", 2],
    ["Annual General Assembly of the Lebanese Franchise Association and Awards Night", 3],
  ])("sizes %s at display-%i", (titleEn, step) => {
    expect(render({ titleEn })).toContain(`font-size:var(--display-${step})`);
  });

  it("still resolves the Arabic title if that locale is ever restored", () => {
    expect(render({}, "ar")).toContain("قمة الفراولة");
  });
});

describe("the featured plate's alignment", () => {
  it("sets the poster flush with the text below it, not centred", () => {
    // Measured in Chromium at 1440px: a centred poster, narrowed to leave room
    // for the button, started ~60px right of the title beneath it.
    const html = renderToStaticMarkup(
      <FeaturedEventPlate locale="en" event={{ ...EVENT }} />,
    );
    const frame = /<div class="(paper-edge[^"]*)"/.exec(html)![1];
    expect(frame).not.toContain("mx-auto");
  });
});

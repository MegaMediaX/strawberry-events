import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { EventHero } from "../event-hero";

/**
 * The event page's header: the poster whole, then the event's name, status,
 * date and venue below it.
 *
 * This file used to assert the opposite — a full-bleed 16/6 frame, the title
 * laid over the cover behind a scrim and vignette, the cover cropped to the
 * organiser's focal point. That composition was retired by decision, the same
 * one applied to the index: posters carry their own title, dates and venue, so
 * the overlay put every fact on screen twice with the headlines colliding.
 * The poster rules themselves (no crop, reserved space, height budget) are
 * tested once, through the index plate, since both use `poster.tsx`.
 */
const render = (props: Partial<Parameters<typeof EventHero>[0]> = {}) =>
  renderToStaticMarkup(
    <EventHero
      title="The Beirut Hospitality Forum"
      dateLabel="28 Aug 2026, 09:00"
      locationLabel="Le Royal Hotel Beirut"
      statusLabel="Open"
      coverUrl="https://cdn.example.com/cover.jpg"
      coverWidth={1600}
      coverHeight={900}
      {...props}
    />,
  );

describe("the event page's header", () => {
  it("sets the event's name as the page's h1, in the display face", () => {
    const html = render();
    expect(html).toMatch(/<h1[^>]*font-heading[^>]*>The Beirut Hospitality Forum<\/h1>/);
  });

  it.each([
    ["Summit", 1],
    ["The Beirut Hospitality & Culinary Forum 2026", 2],
    ["Annual General Assembly of the Lebanese Franchise Association and Awards Night", 3],
  ])("sizes %s at display-%i", (title, step) => {
    expect(render({ title })).toContain(`font-size:var(--display-${step})`);
  });

  it("sets the title BELOW the poster, with nothing laid over the artwork", () => {
    const html = render();
    expect(html.indexOf("cover.jpg")).toBeLessThan(html.indexOf("<h1"));
    expect(html).not.toContain("--scrim-cinema");
    expect(html).not.toContain("--vignette");
    expect(html).not.toContain("text-white");
    expect(html).not.toMatch(/absolute inset-0/);
  });

  it("shows the poster whole, in a box of its own shape", () => {
    const html = render();
    expect(html).toContain("object-contain");
    expect(html).not.toContain("object-cover");
    expect(html).not.toContain("object-position");
    expect(html).toContain("aspect-ratio:1600 / 900");
  });

  it("marks the poster as the page's LCP element, and hides it from readers", () => {
    const img = /<img[^>]*>/.exec(render())![0];
    expect(img).toContain('alt=""');
    expect(img).toContain('loading="eager"');
    expect(img).toMatch(/fetchpriority="high"/i);
  });

  it("carries the status as a stamp that says its word", () => {
    // It was a dark plate with a coloured dot, because it sat on an unknown
    // photograph. On the page the word does the work (1.4.1).
    const html = render();
    expect(html).toMatch(/<span class="paper-stamp[^"]*"[^>]*>Open<\/span>/);
    expect(html).not.toContain("bg-black");
  });

  it.each([
    ["Open", false],
    ["Sold out", true],
    ["Coming soon", true],
  ])("stamps %s in the %s tone", (statusLabel, faded) => {
    const stamp = /<span class="(paper-stamp[^"]*)"/.exec(render({ statusLabel }))![1];
    expect(stamp.includes("muted-foreground")).toBe(faded);
  });

  it("keeps the header, title and status with no cover at all", () => {
    const html = render({ coverUrl: null });
    expect(html).not.toContain("<img");
    expect(html).toContain("var(--gradient-hero-strong)");
    expect(html).toContain("<h1");
    expect(html).toContain(">Open<");
  });

  it("survives an event with neither a date nor a venue", () => {
    const html = render({ dateLabel: null, locationLabel: null });
    expect(html).toContain("<h1");
    expect(html).not.toContain("lucide-calendar");
    expect(html).not.toContain("lucide-map-pin");
  });

  /**
   * An entrance that opened at opacity 0 left the page's largest element an
   * empty hole whenever the script was late or blocked. Caught by
   * screenshotting the built page, so it stays pinned.
   */
  it("is painted by the server, not by a script that has to arrive first", () => {
    const html = render();
    expect(html).not.toMatch(/opacity:\s*0/);
    expect(html).not.toMatch(/translateY/);
  });

  it("uses the shared poster rather than a second copy of it", () => {
    // One implementation of "shown whole", shared with the index plate.
    expect(render()).toMatch(/<div class="paper-edge overflow-hidden bg-muted" style="aspect-ratio:/);
  });
});

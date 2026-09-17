import { describe, it, expect } from "vitest";

import { eventMetadata, shareDescription, type ShareableEvent } from "../metadata";

/** `Metadata["twitter"]` is a union of card shapes; the tests only read `card`. */
const twitterCard = (meta: ReturnType<typeof eventMetadata>) =>
  (meta.twitter as { card?: string } | null | undefined)?.card;

const event: ShareableEvent = {
  titleEn: "Strawberry Summit",
  titleAr: "قمة الفراولة",
  descriptionEn: "Three days of talks and workshops for the region's product teams.",
  descriptionAr: "ثلاثة أيام من الجلسات وورش العمل.",
  coverImagePath: "evt123-abc.jpg",
  venueName: "Le Royal Hotel Beirut",
};

const FROM = "2026-08-28T09:30:00.000Z";
const TO = "2026-08-30T18:00:00.000Z";

describe("shareDescription", () => {
  it("leads with when and where, then the organiser's blurb", () => {
    expect(shareDescription(event, FROM, TO)).toBe(
      "28—30 Aug 2026 · Le Royal Hotel Beirut · Three days of talks and workshops for the region's product teams.",
    );
  });

  it("trims a long blurb on a word boundary", () => {
    const long = { ...event, descriptionEn: "word ".repeat(200) };
    const text = shareDescription(long, FROM, TO);
    expect(text.length).toBeLessThanOrEqual(201);
    expect(text.endsWith("…")).toBe(true);
    expect(text).not.toContain("wor…");
  });

  it("still says something when the event has no blurb and no dates", () => {
    const bare: ShareableEvent = {
      titleEn: "Untitled",
      titleAr: null,
      descriptionEn: null,
      descriptionAr: null,
      coverImagePath: null,
      venueName: null,
    };
    expect(shareDescription(bare, null, null)).toBe("Register for this event.");
  });
});

describe("the preview follows the locale, like every other surface", () => {
  // This module took titleAr and rendered titleEn — the exact bug the rest of
  // the change set fixed in the event card and the register page. Arabic is
  // retired today, so this is dormant; a branch kept for its return has to
  // work on the day it returns.
  it("uses the Arabic title and blurb when asked for Arabic", () => {
    const meta = eventMetadata({
      event,
      dateFrom: FROM,
      dateTo: TO,
      path: "/ar/events/strawberry-summit",
      locale: "ar",
    });
    expect(meta.title).toBe("قمة الفراولة");
    expect(meta.description).toContain("ثلاثة أيام");
  });

  it("falls back to English when the Arabic was never written", () => {
    const meta = eventMetadata({
      event: { ...event, titleAr: null, descriptionAr: null },
      dateFrom: FROM,
      dateTo: TO,
      path: "/ar/events/strawberry-summit",
      locale: "ar",
    });
    expect(meta.title).toBe("Strawberry Summit");
  });
});

describe("eventMetadata", () => {
  it("gives the unfurl the event's own title, cover and canonical path", () => {
    const meta = eventMetadata({
      event,
      dateFrom: FROM,
      dateTo: TO,
      path: "/en/events/strawberry-summit",
    });
    expect(meta.title).toBe("Strawberry Summit");
    expect(meta.alternates?.canonical).toBe("/en/events/strawberry-summit");
    expect(meta.openGraph?.url).toBe("/en/events/strawberry-summit");
    expect(meta.openGraph?.images).toEqual([
      { url: "/media/event-cover/evt123-abc.jpg", alt: "Strawberry Summit" },
    ]);
    expect(twitterCard(meta)).toBe("summary_large_image");
  });

  /**
   * A preview that declares its image's size lets a scraper reserve the right
   * box instead of reflowing when the picture lands. The size comes from the
   * file's own header, recorded at upload.
   */
  it("declares the cover's real dimensions when they are known", () => {
    const meta = eventMetadata({
      event: { ...event, coverWidth: 1600, coverHeight: 900 },
      dateFrom: FROM,
      dateTo: TO,
      path: "/en/events/strawberry-summit",
    });
    expect(meta.openGraph?.images).toEqual([
      {
        url: "/media/event-cover/evt123-abc.jpg",
        alt: "Strawberry Summit",
        width: 1600,
        height: 900,
      },
    ]);
  });

  /**
   * Half a size is not a size, and a WRONG one is worse than none: the scraper
   * reserves a box the picture does not fill. Covers uploaded before the
   * dimensions column existed carry neither, and the preview is silent about
   * it — exactly as every preview was before this.
   */
  it.each([
    ["neither dimension", { coverWidth: null, coverHeight: null }],
    ["only a width", { coverWidth: 1600, coverHeight: null }],
    ["only a height", { coverWidth: null, coverHeight: 900 }],
    ["a zero width", { coverWidth: 0, coverHeight: 900 }],
  ])("declares no dimensions given %s", (_label, size) => {
    const meta = eventMetadata({
      event: { ...event, ...size },
      dateFrom: FROM,
      dateTo: TO,
      path: "/en/events/strawberry-summit",
    });
    expect(meta.openGraph?.images).toEqual([
      { url: "/media/event-cover/evt123-abc.jpg", alt: "Strawberry Summit" },
    ]);
  });

  it("distinguishes the registration page from the event page", () => {
    const meta = eventMetadata({
      event,
      dateFrom: FROM,
      dateTo: TO,
      path: "/en/events/strawberry-summit/register",
      titlePrefix: "Register · ",
    });
    expect(meta.title).toBe("Register · Strawberry Summit");
  });

  it("falls back to a plain card when the event has no cover", () => {
    const meta = eventMetadata({
      event: { ...event, coverImagePath: null },
      dateFrom: FROM,
      dateTo: TO,
      path: "/en/events/strawberry-summit",
    });
    expect(meta.openGraph?.images).toBeUndefined();
    expect(twitterCard(meta)).toBe("summary");
  });
});

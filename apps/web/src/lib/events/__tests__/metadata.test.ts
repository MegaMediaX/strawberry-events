import { describe, it, expect } from "vitest";

import { eventMetadata, shareDescription, type ShareableEvent } from "../metadata";

/** `Metadata["twitter"]` is a union of card shapes; the tests only read `card`. */
const twitterCard = (meta: ReturnType<typeof eventMetadata>) =>
  (meta.twitter as { card?: string } | null | undefined)?.card;

const event: ShareableEvent = {
  titleEn: "Strawberry Summit",
  descriptionEn: "Three days of talks and workshops for the region's product teams.",
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
      descriptionEn: null,
      coverImagePath: null,
      venueName: null,
    };
    expect(shareDescription(bare, null, null)).toBe("Register for this event.");
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

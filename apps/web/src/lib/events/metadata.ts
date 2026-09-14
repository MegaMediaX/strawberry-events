import type { Metadata } from "next";

import { coverImageUrl } from "@/lib/events/cover-image";
import { eventMetaLine } from "@/lib/events/format";

/**
 * How an event looks when its link is pasted somewhere.
 *
 * Event URLs travel by WhatsApp, Instagram and email far more than by search,
 * and with no per-route metadata every one of them unfurled as the same
 * imageless "Strawberry Agency Events · Premium event registration platform" —
 * for an event whose cover, dates and venue were already loaded on the page.
 *
 * The OG image path is site-relative; `metadataBase` in the root layout turns
 * it absolute, which scrapers require.
 */
export interface ShareableEvent {
  titleEn: string;
  descriptionEn: string | null;
  coverImagePath: string | null;
  venueName: string | null;
}

/** How much of the blurb a link preview will actually render. */
const DESCRIPTION_BUDGET = 200;

/** "28—30 Aug 2026 · Le Royal Hotel Beirut · <blurb>", trimmed on a word. */
export function shareDescription(
  event: ShareableEvent,
  dateFrom: string | Date | null,
  dateTo: string | Date | null,
): string {
  const when = eventMetaLine(dateFrom, dateTo, event.venueName);
  const blurb = event.descriptionEn?.replace(/\s+/g, " ").trim() ?? "";
  const room = DESCRIPTION_BUDGET - (when ? when.length + 3 : 0);
  let cut = blurb;
  if (room <= 0) {
    cut = "";
  } else if (blurb.length > room) {
    const wordBreak = blurb.lastIndexOf(" ", room);
    cut = `${blurb.slice(0, wordBreak > 0 ? wordBreak : room)}…`;
  }
  return [when, cut].filter(Boolean).join(" · ") || "Register for this event.";
}

export function eventMetadata({
  event,
  dateFrom,
  dateTo,
  path,
  titlePrefix = "",
}: {
  event: ShareableEvent;
  dateFrom: string | Date | null;
  dateTo: string | Date | null;
  /** Canonical path for this page, e.g. `/en/events/summit`. */
  path: string;
  /** "Register · " on the registration route, so the two pages read apart. */
  titlePrefix?: string;
}): Metadata {
  const title = `${titlePrefix}${event.titleEn}`;
  const description = shareDescription(event, dateFrom, dateTo);
  const image = event.coverImagePath ? coverImageUrl(event.coverImagePath) : null;

  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      title,
      description,
      url: path,
      siteName: "Strawberry Agency Events",
      ...(image ? { images: [{ url: image, alt: event.titleEn }] } : {}),
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
}

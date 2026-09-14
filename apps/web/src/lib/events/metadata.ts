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
  titleAr: string | null;
  descriptionEn: string | null;
  descriptionAr: string | null;
  coverImagePath: string | null;
  venueName: string | null;
}

/**
 * The same dormant-but-correct locale rule the rest of the flow follows.
 *
 * Written down here because this module reintroduced exactly the bug the rest
 * of this change set fixed: taking titleAr and then rendering titleEn. Arabic
 * is retired today (lib/i18n/dir.ts), so this changes nothing — but a branch
 * kept for the day it returns has to work on that day.
 */
function localized(en: string, ar: string | null, locale: string): string {
  return locale === "ar" && ar ? ar : en;
}

function localizedOrNull(
  en: string | null,
  ar: string | null,
  locale: string,
): string | null {
  return (locale === "ar" && ar ? ar : en) || null;
}

/** How much of the blurb a link preview will actually render. */
const DESCRIPTION_BUDGET = 200;

/** "28—30 Aug 2026 · Le Royal Hotel Beirut · <blurb>", trimmed on a word. */
export function shareDescription(
  event: ShareableEvent,
  dateFrom: string | Date | null,
  dateTo: string | Date | null,
  locale = "en",
): string {
  const when = eventMetaLine(dateFrom, dateTo, event.venueName);
  const blurb =
    localizedOrNull(event.descriptionEn, event.descriptionAr, locale)
      ?.replace(/\s+/g, " ")
      .trim() ?? "";
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
  locale = "en",
  titlePrefix = "",
}: {
  locale?: string;
  event: ShareableEvent;
  dateFrom: string | Date | null;
  dateTo: string | Date | null;
  /** Canonical path for this page, e.g. `/en/events/summit`. */
  path: string;
  /** "Register · " on the registration route, so the two pages read apart. */
  titlePrefix?: string;
}): Metadata {
  const eventTitle = localized(event.titleEn, event.titleAr, locale);
  const title = `${titlePrefix}${eventTitle}`;
  const description = shareDescription(event, dateFrom, dateTo, locale);
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
      ...(image ? { images: [{ url: image, alt: eventTitle }] } : {}),
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
}

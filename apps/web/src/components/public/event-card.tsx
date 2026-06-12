"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";

export interface EventCardData {
  slug: string;
  titleEn: string;
  titleAr: string | null;
  visibility: string;
  comingSoon: boolean;
  coverUrl?: string | null;
}

const EASE = [0.22, 1, 0.36, 1] as const;

export function EventCard({
  event,
  locale,
  featured = false,
  index = 0,
}: {
  event: EventCardData;
  locale: string;
  /** Full-bleed spotlight treatment — used for the first / only event. */
  featured?: boolean;
  /** Position in its group, drives the entry stagger. */
  index?: number;
}) {
  const reduce = useReducedMotion();
  const isAr = locale === "ar";
  const title = isAr && event.titleAr ? event.titleAr : event.titleEn;
  const href = `/${locale}/events/${event.slug}`;
  const viewLabel = isAr ? "عرض الفعالية" : "View event";

  const statusPill = event.comingSoon ? (
    <span className="inline-flex w-fit items-center rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-white ring-1 ring-white/25 backdrop-blur">
      {isAr ? "قريباً" : "Coming soon"}
    </span>
  ) : (
    <span className="inline-flex w-fit items-center rounded-full bg-emerald-500/25 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-emerald-50 ring-1 ring-emerald-300/40 backdrop-blur">
      {isAr ? "مفتوح" : "Open"}
    </span>
  );

  // Cover image layer — real <img> so it can zoom on hover, clipped by the card.
  const cover = event.coverUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={event.coverUrl}
      alt=""
      className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out will-change-transform group-hover:scale-[1.045] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
    />
  ) : (
    <div
      className="absolute inset-0 transition-transform duration-500 ease-out group-hover:scale-[1.045] motion-reduce:group-hover:scale-100"
      style={{ backgroundImage: "var(--gradient-hero-strong)" }}
    />
  );

  // Scrim: a constant dark base + a directional gradient anchored to the text,
  // tuned so white text clears WCAG AA over any cover (even bright artwork).
  const scrim = (
    <>
      <div className="absolute inset-0 bg-black/20" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent" />
    </>
  );

  const content = (
    <div className="absolute inset-x-0 bottom-0 flex flex-col items-start gap-2 p-5 text-start sm:p-6">
      {statusPill}
      <h2
        dir="auto"
        className={[
          "max-w-2xl font-extrabold leading-[1.08] tracking-tight text-white drop-shadow-sm",
          featured ? "text-2xl sm:text-4xl lg:text-5xl" : "text-lg sm:text-xl",
        ].join(" ")}
      >
        {title}
      </h2>
      {!event.comingSoon && (
        <span
          className={[
            "mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-white",
            // CTA is always visible on touch; on pointer devices it reveals on hover.
            "sm:translate-y-1 sm:opacity-0 sm:transition-all sm:duration-300",
            "sm:group-hover:translate-y-0 sm:group-hover:opacity-100 sm:group-focus-visible:translate-y-0 sm:group-focus-visible:opacity-100",
            "motion-reduce:translate-y-0 motion-reduce:transition-none",
          ].join(" ")}
        >
          {viewLabel}
          <ArrowRight className="h-4 w-4 rtl:-scale-x-100" />
        </span>
      )}
    </div>
  );

  const frame = (
    <div
      className={[
        "group relative block overflow-hidden rounded-[var(--radius-xl)] shadow-sm outline-none transition-shadow duration-300",
        "hover:shadow-2xl focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black",
        featured ? "aspect-[16/10] sm:aspect-[2/1]" : "aspect-[4/3] sm:aspect-[3/2]",
        event.comingSoon ? "cursor-default" : "",
      ].join(" ")}
    >
      {cover}
      {scrim}
      {content}
    </div>
  );

  const entry = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.3 } }
    : featured
      ? {
          initial: { opacity: 0, scale: 0.97 },
          animate: { opacity: 1, scale: 1 },
          transition: { duration: 0.55, ease: EASE, delay: 0.1 },
        }
      : {
          initial: { opacity: 0, y: 24 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.45, ease: EASE, delay: 0.15 + index * 0.08 },
        };

  return (
    <motion.div {...entry}>
      {event.comingSoon ? (
        <div className="opacity-90">{frame}</div>
      ) : (
        <Link href={href} aria-label={title} className="block rounded-[var(--radius-xl)]">
          {frame}
        </Link>
      )}
    </motion.div>
  );
}

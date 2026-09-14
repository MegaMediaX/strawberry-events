"use client";

import { motion } from "framer-motion";
import { Calendar, MapPin } from "lucide-react";

export function EventHero({
  title,
  dateLabel,
  locationLabel,
  statusLabel,
  coverUrl,
}: {
  title: string;
  dateLabel: string | null;
  locationLabel: string | null;
  statusLabel: string;
  coverUrl?: string | null;
}) {
  const isOpen = statusLabel === "Open";
  const isSoldOut = statusLabel === "Sold out";

  const badge = (
    <span
      /* The badge sits over an admin-uploaded photo, so its contrast used to be
         whatever the image happened to be — emerald-50 on a 30% emerald wash
         is unreadable over a pale crop. A near-opaque dark plate reads on any
         artwork; the state is carried by a dot and the word, not by the
         plate's tint. */
      className="absolute end-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-black/75 px-3 py-1 text-xs font-semibold text-white backdrop-blur"
    >
      <span
        aria-hidden="true"
        className="inline-block size-1.5 rounded-full"
        style={{
          background: isOpen
            ? "var(--brand-success)"
            : isSoldOut
              ? "#ffffff"
              : "var(--brand-amber)",
        }}
      />
      {statusLabel}
    </span>
  );

  function meta(light: boolean) {
    const cls = light ? "text-white/85" : "text-muted-foreground";
    return (
      <div className={`mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm ${cls}`}>
        {dateLabel && (
          <span className="flex items-center gap-1.5">
            <Calendar className="h-4 w-4 opacity-70" />
            {dateLabel}
          </span>
        )}
        {locationLabel && (
          <span className="flex items-center gap-1.5">
            <MapPin className="h-4 w-4 opacity-70" />
            {locationLabel}
          </span>
        )}
      </div>
    );
  }

  // With a cover: show the FULL image (never cropped) at its natural aspect,
  // with the title + meta below it. Works for wide banners and standard photos.
  if (coverUrl) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        <div className="relative aspect-[16/6] w-full overflow-hidden rounded-[var(--radius-xl)] bg-muted/30">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={coverUrl}
            alt={title}
            className="absolute inset-0 h-full w-full object-cover"
          />
          {badge}
        </div>
        <div className="mt-4">
          <h1 className="max-w-3xl text-2xl font-extrabold leading-[1.05] tracking-tight sm:text-4xl">
            {title}
          </h1>
          {meta(false)}
        </div>
      </motion.div>
    );
  }

  // No cover — gradient hero with overlaid title.
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="relative overflow-hidden rounded-[var(--radius-xl)] p-6 sm:p-10"
      style={{ backgroundImage: "var(--gradient-hero-strong)" }}
    >
      {badge}
      <h1 className="max-w-2xl text-3xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-5xl">
        {title}
      </h1>
      {meta(true)}
    </motion.div>
  );
}

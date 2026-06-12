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
      className={[
        "absolute end-4 top-4 rounded-full px-3 py-1 text-xs font-semibold backdrop-blur",
        isSoldOut
          ? "bg-black/40 text-white/80"
          : isOpen
            ? "bg-emerald-500/30 text-emerald-50 ring-1 ring-emerald-400/40"
            : "bg-black/40 text-white",
      ].join(" ")}
    >
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
        <div className="relative w-full overflow-hidden rounded-[var(--radius-xl)] bg-muted/30">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={coverUrl}
            alt={title}
            className="mx-auto block h-auto max-h-[70vh] w-full object-contain"
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

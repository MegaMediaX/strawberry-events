"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Calendar, MapPin } from "lucide-react";

const RATIO_16_9 = 16 / 9;

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

  // Measure the cover's real aspect ratio: a ~16:9 image gets the clean 16:9
  // frame (shown in full, no crop); anything else keeps the original overlay.
  const [is169, setIs169] = useState(false);
  useEffect(() => {
    if (!coverUrl) {
      setIs169(false);
      return;
    }
    const img = new Image();
    img.onload = () => {
      if (img.naturalHeight > 0) {
        setIs169(Math.abs(img.naturalWidth / img.naturalHeight - RATIO_16_9) < 0.05);
      }
    };
    img.src = coverUrl;
  }, [coverUrl]);

  const badge = (
    <span
      className={[
        "absolute end-4 top-4 rounded-full px-3 py-1 text-xs font-semibold backdrop-blur",
        isSoldOut
          ? "bg-black/30 text-white/80"
          : isOpen
            ? "bg-emerald-500/20 text-emerald-100 ring-1 ring-emerald-400/30"
            : "bg-white/20 text-white",
      ].join(" ")}
    >
      {statusLabel}
    </span>
  );

  const meta = (
    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-white/85">
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

  // 16:9 cover — render the image in full inside a fixed 16:9 frame.
  if (coverUrl && is169) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="relative aspect-[16/9] w-full overflow-hidden rounded-[var(--radius-xl)]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={coverUrl} alt={title} className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
        {badge}
        <div className="absolute inset-x-0 bottom-0 p-5 sm:p-8">
          <h1 className="max-w-2xl text-2xl font-extrabold leading-[1.05] tracking-tight text-white drop-shadow-sm sm:text-4xl lg:text-5xl">
            {title}
          </h1>
          {meta}
        </div>
      </motion.div>
    );
  }

  // Fallback — original overlay style (content-driven height) for non-16:9
  // covers or no cover at all.
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="relative overflow-hidden rounded-[var(--radius-xl)] p-6 sm:p-10"
      style={
        coverUrl
          ? {
              backgroundImage: `linear-gradient(to top, rgba(0,0,0,0.7), rgba(0,0,0,0.25)), url("${coverUrl}")`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }
          : { backgroundImage: "var(--gradient-hero-strong)" }
      }
    >
      {badge}
      <h1 className="max-w-2xl text-3xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-5xl">
        {title}
      </h1>
      {meta}
    </motion.div>
  );
}

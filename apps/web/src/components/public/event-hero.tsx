"use client";

import { motion } from "framer-motion";
import { Calendar, MapPin } from "lucide-react";

export function EventHero({
  title,
  dateLabel,
  locationLabel,
  statusLabel,
}: {
  title: string;
  dateLabel: string | null;
  locationLabel: string | null;
  statusLabel: string;
}) {
  const isOpen = statusLabel === "Open";
  const isSoldOut = statusLabel === "Sold out";

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="relative overflow-hidden rounded-[var(--radius-xl)] p-6 sm:p-10"
      style={{ backgroundImage: "var(--gradient-hero-strong)" }}
    >
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
      <h1 className="max-w-2xl text-3xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-5xl">
        {title}
      </h1>
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-white/80">
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
    </motion.div>
  );
}

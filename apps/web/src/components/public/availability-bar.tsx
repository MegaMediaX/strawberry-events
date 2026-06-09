"use client";

import { useEffect, useRef, useState } from "react";
import { capacityState } from "@/lib/events/capacity";

const COLOR: Record<string, string> = {
  available: "var(--brand-success)",
  filling: "var(--brand-amber)",
  almost_full: "var(--brand-danger)",
  sold_out: "var(--muted-foreground)",
};

const LABEL: Record<string, (left: number) => string> = {
  available: () => "Spots available",
  filling: (l) => `Filling fast — ${l} left`,
  almost_full: (l) => `Almost full — ${l} left`,
  sold_out: () => "Sold out",
};

export function AvailabilityBar({
  sold,
  total,
}: {
  sold: number;
  total: number | null;
}) {
  const state = capacityState(sold, total);
  const pct = total && total > 0 ? Math.min(100, (sold / total) * 100) : 8;
  const left = total ? Math.max(0, total - sold) : 0;

  // Fill-on-mount animation, guarded for reduced motion.
  const [w, setW] = useState(0);
  const reduce = useRef(false);
  useEffect(() => {
    reduce.current =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const id = requestAnimationFrame(() => setW(pct));
    return () => cancelAnimationFrame(id);
  }, [pct]);

  return (
    <div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full"
        style={{ background: "var(--border)" }}
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={state === "almost_full" ? "animate-pulse" : ""}
          style={{
            width: `${reduce.current ? pct : w}%`,
            height: "100%",
            background: COLOR[state],
            borderRadius: "9999px",
            transition: reduce.current
              ? undefined
              : "width 800ms cubic-bezier(0.16,1,0.30,1)",
          }}
        />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {total ? LABEL[state](left) : "Open registration"}
      </p>
    </div>
  );
}

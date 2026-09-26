"use client";

import { useEffect, useState } from "react";
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
  const pct = total && total > 0 ? Math.min(100, (sold / total) * 100) : 0;
  const left = total ? Math.max(0, total - sold) : 0;

  // Fill-on-mount animation, guarded for reduced motion.
  const [reduced] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [w, setW] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setW(pct));
    return () => cancelAnimationFrame(id);
  }, [pct]);

  // With no capacity there is no progress to draw. The bar used to fill to a
  // hardcoded 8% and report aria-valuenow="8" under "Open registration" — a
  // scarcity signal derived from nothing.
  if (!total) {
    return <p className="text-xs text-muted-foreground">Open registration</p>;
  }

  return (
    <div>
      <div
        className="h-1.5 w-full overflow-hidden"
        style={{ background: "var(--border)" }}
        role="progressbar"
        aria-label="Tickets sold"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={LABEL[state](left)}
      >
        <div
          // motion-reduce: the "almost full" pulse ran forever regardless of
          // the preference the width transition right beside it respects.
          className={state === "almost_full" ? "animate-pulse motion-reduce:animate-none" : ""}
          style={{
            width: `${reduced ? pct : w}%`,
            height: "100%",
            background: COLOR[state],
            transition: reduced
              ? undefined
              : "width 800ms cubic-bezier(0.16,1,0.30,1)",
          }}
        />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{LABEL[state](left)}</p>
    </div>
  );
}

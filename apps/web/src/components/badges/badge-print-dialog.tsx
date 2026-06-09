"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { BadgeTemplate, type BadgeData } from "./badge-template";

/**
 * Renders a badge and prints it. When `auto` is set, triggers the print dialog
 * once on mount (used right after a successful scan/check-in).
 */
export function BadgePrintDialog({
  badge,
  auto = false,
}: {
  badge: BadgeData;
  auto?: boolean;
}) {
  useEffect(() => {
    if (auto) window.print();
  }, [auto]);

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="rounded-[var(--radius-lg)] border border-border bg-white p-2 shadow-sm">
        <BadgeTemplate badge={badge} />
      </div>
      <Button onClick={() => window.print()} className="print:hidden">
        Print / reprint badge
      </Button>
    </div>
  );
}

"use client";

import type { BadgeData } from "@/components/badges/badge-template";
import { buildBadgeZpl } from "./badge-zpl";
import { buildBadgeTspl } from "./badge-tspl";
import { renderBadgeBitmap } from "./badge-canvas";
import { getPrinterLanguage, printZpl, printTspl, PrintError } from "./print-client";

/**
 * Print a badge on whatever this station's printer speaks.
 *
 * One entry point so the check-in panel never has to know: adding TSPL must not
 * put a branch on the door path that a PC42d station could fall down.
 *
 * ZPL is the default and its path is byte-for-byte what it always was. A
 * station only takes the TSPL path if someone deliberately set it.
 */
export async function printBadge(badge: BadgeData): Promise<void> {
  if (getPrinterLanguage() === "tspl") {
    let job: Uint8Array;
    try {
      job = buildBadgeTspl(renderBadgeBitmap(badge), badge.badgeSlug);
    } catch (err) {
      // A render failure is a property of THIS STATION — no canvas, a bad size,
      // a missing font — not of this label. Reported as a plain Error it would
      // be bucketed with a paper jam: the door would silently re-run the same
      // failing render for every attendee behind them, telling the operator to
      // check paper each time. Classified as "printer" so it latches once and
      // says the station needs fixing.
      throw new PrintError(
        `This station cannot render badges (${(err as Error).message}). Switch Printer language back to ZPL, or use the on-screen print.`,
        "printer",
      );
    }
    return printTspl(job);
  }
  return printZpl(buildBadgeZpl(badge));
}

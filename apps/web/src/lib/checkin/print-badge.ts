"use client";

import type { BadgeData } from "@/components/badges/badge-template";
import { buildBadgeZpl } from "./badge-zpl";
import { buildBadgeTspl } from "./badge-tspl";
import { renderBadgeBitmap } from "./badge-canvas";
import { getPrinterLanguage, printZpl, printTspl } from "./print-client";

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
    return printTspl(buildBadgeTspl(renderBadgeBitmap(badge), badge.badgeSlug));
  }
  return printZpl(buildBadgeZpl(badge));
}

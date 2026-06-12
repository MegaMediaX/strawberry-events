import type { BadgeData } from "@/components/badges/badge-template";

/**
 * Generate ZPL II for a 60×40 mm (landscape) attendee badge, targeting the
 * Honeywell PC42d (203 dpi, ZSim2 / ZPL emulation). Sent raw via QZ Tray.
 *
 * Layout (top → bottom, centered):
 *   - role tag band across the top (solid black band, reversed white text —
 *     thermal is monochrome, so the on-screen tag color becomes black)
 *   - full name (large)
 *   - company (smaller, optional)
 *
 * 203 dpi ≈ 8 dots/mm, so 60 × 40 mm ≈ 480 × 320 dots.
 */

export const DPI = 203;
export const DOTS_PER_MM = DPI / 25.4; // ≈ 7.992
export const LABEL_W_MM = 60;
export const LABEL_H_MM = 40;
export const LABEL_WIDTH = Math.round(LABEL_W_MM * DOTS_PER_MM); // ≈ 480
export const LABEL_HEIGHT = Math.round(LABEL_H_MM * DOTS_PER_MM); // ≈ 320

const MARGIN = 16;

/**
 * Make text safe for a ZPL field: replace the control prefixes ^ and ~ with a
 * space, drop ASCII control chars (code < 0x20) that would corrupt the stream,
 * and collapse whitespace. Spaces and hyphens in names are preserved.
 * Note: the PC42d's default bitmap fonts are Latin-only — Arabic names need a
 * TrueType font downloaded to the printer (out of scope here; tracked separately).
 */
export function sanitizeZplText(value: string): string {
  return Array.from(value.replace(/[\^~]/g, " "))
    .filter((ch) => ch.charCodeAt(0) >= 0x20)
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

/** A centered field block spanning the full label width (minus margins). */
function centeredBlock(
  y: number,
  fontHeight: number,
  text: string,
  maxLines = 1,
): string {
  const blockWidth = LABEL_WIDTH - MARGIN * 2;
  return (
    `^FO${MARGIN},${y}` +
    `^A0N,${fontHeight},${fontHeight}` +
    `^FB${blockWidth},${maxLines},0,C,0` +
    `^FD${sanitizeZplText(text)}^FS`
  );
}

export function buildBadgeZpl(badge: BadgeData): string {
  const tag = sanitizeZplText(badge.tag).toUpperCase();
  const company = badge.company ? sanitizeZplText(badge.company) : null;

  // Tag band: a filled black box with reversed (white) centered text.
  const bandY = 12;
  const bandHeight = 48;
  const band =
    `^FO0,${bandY}^GB${LABEL_WIDTH},${bandHeight},${bandHeight},B,0^FS` +
    `^FO${MARGIN},${bandY + 11}^A0N,28,28^FR^FB${LABEL_WIDTH - MARGIN * 2},1,0,C,0^FD${tag}^FS`;

  return [
    "^XA",
    `^PW${LABEL_WIDTH}`,
    `^LL${LABEL_HEIGHT}`,
    "^LH0,0",
    band,
    centeredBlock(120, 44, badge.fullName, 2),
    company ? centeredBlock(230, 28, company, 1) : "",
    "^XZ",
  ]
    .filter(Boolean)
    .join("\n");
}

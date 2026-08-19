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
    // Drop control characters, AND anything above Latin-1. The printer's
    // resident fonts are Latin-only and its default code page is single-byte,
    // so an Arabic name arrives as UTF-8 bytes and prints as mojibake — a badge
    // worn for three days that looks like the event is broken, rather than like
    // a limitation. Dropping is deliberate: see `hasUnprintableName`, which lets
    // the caller detect this BEFORE printing rather than discovering it after.
    .filter((ch) => {
      const c = ch.charCodeAt(0);
      return c >= 0x20 && c <= 0xff;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * True when a name cannot be printed in the printer's Latin fonts.
 *
 * ZPL performs no bidirectional reordering and no Arabic contextual shaping, so
 * even a downloaded Arabic TrueType font would render disconnected, reversed
 * letterforms. There is no correct badge for these names on this hardware.
 *
 * Do NOT auto-transliterate. In Lebanon, whether محمد is Mohamad, Mohammed,
 * Muhammad or Mhamad is personal and inherited; choosing one for someone and
 * printing it on a badge they wear for three days is a small insult repeated all
 * day. Ask them, or leave a ruled line and let staff write it.
 */
export function hasUnprintableName(value: string): boolean {
  return Array.from(value).some((ch) => ch.charCodeAt(0) > 0xff);
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

  // Tag band: a filled black box with reversed (white) centered text. The tag
  // is the most prominent element, so it gets a tall band and large font.
  const bandY = 10;
  const bandHeight = 76;
  const tagFont = 50;
  const band =
    `^FO0,${bandY}^GB${LABEL_WIDTH},${bandHeight},${bandHeight},B,0^FS` +
    `^FO${MARGIN},${bandY + Math.round((bandHeight - tagFont) / 2)}^A0N,${tagFont},${tagFont}^FR^FB${LABEL_WIDTH - MARGIN * 2},1,0,C,0^FD${tag}^FS`;

  return [
    "^XA",
    `^PW${LABEL_WIDTH}`,
    `^LL${LABEL_HEIGHT}`,
    "^LH0,0",
    band,
    centeredBlock(140, 44, badge.fullName, 2),
    company ? centeredBlock(248, 28, company, 1) : "",
    "^XZ",
  ]
    .filter(Boolean)
    .join("\n");
}

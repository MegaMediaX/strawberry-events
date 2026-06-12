import type { BadgeData } from "@/components/badges/badge-template";

/**
 * Generate ZPL II for a 6×4 inch (landscape) attendee badge, targeting the
 * Honeywell PC42d (203 dpi, ZSim2 / ZPL emulation). Sent raw via QZ Tray.
 *
 * Layout (top → bottom, centered):
 *   - role tag band across the top (solid black band, reversed white text —
 *     thermal is monochrome, so the on-screen tag color becomes black)
 *   - full name (large)
 *   - company (smaller, optional)
 *   - QR code at the bottom, encoding the pretix secret (the check-in payload)
 *
 * Stock is 6in wide × 4in tall at 203 dpi = 1218 × 812 dots.
 */

export const DPI = 203;
export const LABEL_WIDTH = 6 * DPI; // 1218 (6in wide, landscape)
export const LABEL_HEIGHT = 4 * DPI; // 812 (4in tall)

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

/** A centered field block spanning the full label width. */
function centeredBlock(
  y: number,
  fontHeight: number,
  text: string,
  maxLines = 1,
): string {
  const margin = 32;
  const blockWidth = LABEL_WIDTH - margin * 2;
  return (
    `^FO${margin},${y}` +
    `^A0N,${fontHeight},${fontHeight}` +
    `^FB${blockWidth},${maxLines},0,C,0` +
    `^FD${sanitizeZplText(text)}^FS`
  );
}

export function buildBadgeZpl(badge: BadgeData): string {
  const tag = sanitizeZplText(badge.tag).toUpperCase();
  const company = badge.company ? sanitizeZplText(badge.company) : null;
  const qr = sanitizeZplText(badge.qrValue);

  // Tag band: a filled black box with reversed (white) centered text.
  const bandY = 36;
  const bandHeight = 96;
  const band =
    `^FO0,${bandY}^GB${LABEL_WIDTH},${bandHeight},${bandHeight},B,0^FS` +
    `^FO32,${bandY + 24}^A0N,56,56^FR^FB${LABEL_WIDTH - 64},1,0,C,0^FD${tag}^FS`;

  // QR centered near the bottom. Magnitude 7 at 203 dpi is comfortably scannable
  // and fits the shorter 812-dot height.
  const qrMagnitude = 7;
  const qrY = 560;
  // ^BQ has no built-in centering; approximate center for a typical secret length.
  const qrX = Math.round((LABEL_WIDTH - 200) / 2);
  const qrBlock = `^FO${qrX},${qrY}^BQN,2,${qrMagnitude}^FDLA,${qr}^FS`;

  return [
    "^XA",
    `^PW${LABEL_WIDTH}`,
    `^LL${LABEL_HEIGHT}`,
    "^LH0,0",
    band,
    centeredBlock(210, 90, badge.fullName, 2),
    company ? centeredBlock(380, 50, company, 1) : "",
    qrBlock,
    "^XZ",
  ]
    .filter(Boolean)
    .join("\n");
}

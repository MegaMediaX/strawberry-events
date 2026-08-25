import type { BadgeData } from "@/components/badges/badge-template";
import { badgeProfileUrl } from "./badge-slug";
// Only the job-title line is taken from the shared module. The name and
// company keep the numbers this file has always used, because the three
// PC42d lanes were verified against them on hardware — see the note below.
import { JOB_TITLE_Y, JOB_TITLE_SIZE } from "./badge-layout";

/**
 * Generate ZPL II for a 60×40 mm (landscape) attendee badge, targeting the
 * Honeywell PC42d (203 dpi, ZSim2 / ZPL emulation). Sent raw via QZ Tray.
 *
 * Layout (top → bottom, centered):
 *   - role tag band across the top (solid black band, reversed white text —
 *     thermal is monochrome, so the on-screen tag color becomes black)
 *   - full name (large)
 *   - company (smaller, optional)
 *   - job title (smaller still, optional)
 *   - contact-profile QR, bottom right (optional — omitted if no slug)
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

/** Role band across the top; everything else is laid out below it. */
const BAND_Y = 10;
const BAND_HEIGHT = 76;
const BAND_BOTTOM = BAND_Y + BAND_HEIGHT; // 86

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

/**
 * QR geometry, derived rather than guessed.
 *
 * The payload is 48 alphanumeric characters, which at error-correction level Q
 * (25% recovery) is a version-3 symbol: 29 modules. At magnification 5 that is
 * 145 dots — 18.1 mm, with 0.626 mm modules.
 *
 * Module size is the number that matters. Below roughly 0.5 mm a phone camera
 * starts failing on a badge that has been creased, worn for three days and
 * scanned in venue lighting. 0.626 mm leaves real margin. Level Q rather than H
 * is a deliberate trade: H would force version 4 and cost that margin, and 25%
 * recovery is already generous for a symbol this size.
 */
const QR_MAGNIFICATION = 5;
const QR_MODULES = 29;
const QR_SIZE = QR_MODULES * QR_MAGNIFICATION; // 145 dots

/**
 * Blank margin around the symbol, in MODULES. The QR spec requires at least 4;
 * anything less and a decoder cannot find the symbol's edge and simply refuses.
 *
 * This is what broke the first printed badge. The QR sat 16 dots from the label
 * edge — 3.2 modules, under spec — and would not scan. 7 modules is the spec
 * minimum plus real headroom, which matters here because the last few
 * millimetres of a thermal label curl away from the platen and print unevenly.
 * The quiet zone must be blank LABEL, not blank space that runs off the edge.
 */
const QR_QUIET_MODULES = 7;
const QR_QUIET = QR_QUIET_MODULES * QR_MAGNIFICATION; // 35 dots

const QR_X = LABEL_WIDTH - QR_QUIET - QR_SIZE;

/** Centered in the band-to-bottom-edge space, so neither margin is the tight one. */
const QR_Y = BAND_BOTTOM + Math.round((LABEL_HEIGHT - BAND_BOTTOM - QR_SIZE) / 2);

/**
 * Horizontal room left for text. Stops a full quiet zone short of the symbol —
 * a name wrapping to within a few dots of the QR eats the left quiet zone and
 * kills the scan just as effectively as running off the label edge.
 */
const TEXT_WIDTH = QR_X - MARGIN - QR_QUIET;

/** A left-aligned field block in the column beside the QR. */
function textBlock(y: number, fontHeight: number, text: string, maxLines = 1): string {
  return (
    `^FO${MARGIN},${y}` +
    `^A0N,${fontHeight},${fontHeight}` +
    `^FB${TEXT_WIDTH},${maxLines},0,L,0` +
    `^FD${sanitizeZplText(text)}^FS`
  );
}

/**
 * The QR field, or an empty string if it cannot be built safely.
 *
 * `badgeProfileUrl` throws when the configured host makes the payload longer
 * than the geometry above reserves. That is a real problem worth surfacing —
 * but not by refusing to print a badge. This is the door: a badge with no QR
 * still gets a paying attendee into the room, and an exception here would take
 * check-in down over a decoration.
 */
function qrBlock(slug: string): string {
  try {
    return (
      `^FO${QR_X},${QR_Y}^BQN,2,${QR_MAGNIFICATION},Q,7` +
      `^FDQA,${badgeProfileUrl(slug)}^FS`
    );
  } catch (err) {
    console.error("[badge] QR omitted:", (err as Error).message);
    return "";
  }
}

/**
 * The job title as it can actually be printed, or null.
 *
 * Returns null both when there is no title and when there was one the printer
 * cannot render — but only the second case is reported, because only the second
 * is a surprise. See `hasUnprintableName` for why transliterating instead would
 * be worse.
 */
function printableJobTitle(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const printable = sanitizeZplText(raw);
  if (!printable) {
    console.error(
      "[badge] job title dropped — nothing printable in the printer's Latin fonts:",
      { length: raw.trim().length },
    );
    return null;
  }
  return printable;
}

export function buildBadgeZpl(badge: BadgeData): string {
  const tag = sanitizeZplText(badge.tag).toUpperCase();
  const company = badge.company ? sanitizeZplText(badge.company) : null;
  // Gate on the SANITISED value, not the raw one. The printer's fonts are
  // Latin-only, so an Arabic job title sanitises to "" — the line is dropped
  // and the badge comes out byte-identical to one where the attendee never
  // answered. Dropping is the only correct output on this hardware; dropping
  // SILENTLY is not, because nothing then distinguishes "not given" from
  // "given and discarded", and nobody ever learns the field was useless for
  // those attendees.
  const jobTitle = printableJobTitle(badge.jobTitle);

  // Tag band: a filled black box with reversed (white) centered text. The tag
  // is the most prominent element, so it gets a tall band and large font.
  const bandY = BAND_Y;
  const bandHeight = BAND_HEIGHT;
  const tagFont = 50;
  const band =
    `^FO0,${bandY}^GB${LABEL_WIDTH},${bandHeight},${bandHeight},B,0^FS` +
    `^FO${MARGIN},${bandY + Math.round((bandHeight - tagFont) / 2)}^A0N,${tagFont},${tagFont}^FR^FB${LABEL_WIDTH - MARGIN * 2},1,0,C,0^FD${tag}^FS`;

  // No slug, no QR. Reprints of orders that predate the column, and the
  // TEST_BADGE the staff page prints to prove the printer is alive, must still
  // produce a valid label rather than throwing at the door.
  const qr = badge.badgeSlug ? qrBlock(badge.badgeSlug) : "";

  return [
    "^XA",
    `^PW${LABEL_WIDTH}`,
    `^LL${LABEL_HEIGHT}`,
    "^LH0,0",
    band,
    textBlock(104, 40, badge.fullName, 2),
    company ? textBlock(196, 26, company, 1) : "",
    jobTitle ? textBlock(JOB_TITLE_Y, JOB_TITLE_SIZE, jobTitle, 1) : "",
    qr,
    "^XZ",
  ]
    .filter(Boolean)
    .join("\n");
}

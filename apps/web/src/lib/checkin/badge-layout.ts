/**
 * Badge geometry, shared by every printer language.
 *
 * These numbers are the badge. ZPL and TSPL differ in how they DRAW, not in
 * where things go, so the layout lives here once rather than being re-derived
 * per language — which is how the two printers end up disagreeing.
 */
export const LABEL_W = 480; // 60 mm at 203 dpi
export const LABEL_H = 320; // 40 mm

export const BAND_Y = 10;
export const BAND_H = 76;
export const BAND_BOTTOM = BAND_Y + BAND_H;

export const QR_MODULES = 29; // version 3
export const QR_MAG = 5;
export const QR_SIZE = QR_MODULES * QR_MAG; // 145

/**
 * Blank margin around the QR, in dots. The spec floor is 4 modules; 7 gives
 * headroom for a creased badge and an unevenly printed label edge.
 *
 * This constant has now prevented the same bug twice — once on the PC42d, where
 * a QR 3.2 modules from the edge would not scan, and once on the Xprinter,
 * where an unwrapped name reached the QR and left no quiet zone on its left.
 * Both badges looked perfect.
 */
export const QR_QUIET = 7 * QR_MAG; // 35

export const QR_X = LABEL_W - QR_QUIET - QR_SIZE; // 300
export const QR_Y = BAND_BOTTOM + Math.round((LABEL_H - BAND_BOTTOM - QR_SIZE) / 2);

export const TEXT_LEFT = 16;
/** Text must stop here. Beyond it, the QR loses its quiet zone and stops scanning. */
export const TEXT_RIGHT = QR_X - QR_QUIET; // 265
export const TEXT_WIDTH = TEXT_RIGHT - TEXT_LEFT; // 249

export const NAME_Y = 98;
export const NAME_SIZE = 38;
export const NAME_LINE_H = 42;
export const NAME_MAX_LINES = 2;
/** Smallest the name may shrink to before we simply clip it. */
export const NAME_MIN_SIZE = 24;
export const COMPANY_Y = 196;
export const COMPANY_SIZE = 26;
/**
 * Job title, on its own line under the company.
 *
 * Below rather than above deliberately: the company sits at 196 and the three
 * PC42d lanes were verified on hardware against that exact layout. Appending a
 * line leaves every existing element where it was, so a badge without a title
 * is byte-identical to the proven one — which is what almost every badge on the
 * door will be.
 *
 * 230 clears the company (196 + 26 = 222) and 230 + 24 = 254 stays well inside
 * the 320-dot label. One line only: a second would run into the QR's row.
 *
 * The 15-character cap (JOB_TITLE_MAX) makes REALISTIC titles fit the 249-dot
 * column at this size: measured in Arial 24px, "General Manager" is 187 dots and
 * "Procure officer" 156. It is NOT a guarantee — character count is not width,
 * and 15 wide glyphs ("WWWWWWWWWWWWWWW") measure 340 and would overflow.
 *
 * What actually protects the QR is the CLIP, not the cap: the canvas clips to
 * TEXT_WIDTH and ZPL's ^FB is 249 wide with one line, so an over-wide title is
 * cut off at the column edge instead of reaching the quiet zone. A clipped
 * title is a cosmetic problem; a title touching the QR is a badge that will not
 * scan, and that is the one that must be impossible.
 */
export const JOB_TITLE_Y = 230;
export const JOB_TITLE_SIZE = 24;

export const TAG_SIZE = 46;

/** Room the role band has for text, between the same margins as everything else. */
export const BAND_TEXT_WIDTH = LABEL_W - TEXT_LEFT * 2; // 448

/**
 * Rough advance width of one upper-case bold glyph, as a fraction of font size.
 *
 * A fraction rather than a measurement because ZPL cannot measure anything: the
 * printer renders `^A0N` itself and the host only names a height. The canvas
 * renderer COULD measure exactly, and deliberately does not — if the two used
 * different rules they would choose different sizes for the same badge, which
 * is precisely the "two printers disagree" failure this module exists to stop.
 *
 * 0.62 is deliberately generous for a Helvetica-class face; erring wide costs a
 * slightly smaller band and erring narrow costs a truncated role.
 */
export const BAND_ADVANCE = 0.62;

/** However long the role, the band never becomes unreadable across a room. */
export const BAND_MIN_SIZE = 28;

/**
 * The font size for a role band, shrunk only as far as the text demands.
 *
 * Roles that already fit are returned at `max` untouched, so every badge
 * printed before long roles existed is byte-for-byte unchanged. Only
 * "ORGANISING COMMITTEE" — 20 characters — actually shrinks; without this both
 * renderers would silently cut it off, ZPL at its field-block width and canvas
 * at its clip, and someone would wear "ORGANISING COMMITT" for three days.
 */
export function bandFontSize(text: string, max: number): number {
  const n = text.trim().length;
  if (n === 0) return max;
  const fitted = Math.floor(BAND_TEXT_WIDTH / (BAND_ADVANCE * n));
  return Math.max(BAND_MIN_SIZE, Math.min(max, fitted));
}

/**
 * Break `text` into at most `maxLines` lines that each fit `maxWidth`.
 *
 * Takes a measuring function so the caller supplies real metrics — canvas in
 * the browser, a stub in tests. Guessing an average character width is what put
 * a name into the QR's quiet zone.
 *
 * A single word longer than the line is NOT broken mid-word: it is left to
 * overflow and reported, because a name silently chopped in half is worse at a
 * door than one that is slightly too wide, and the caller can shrink instead.
 */
export function wrapText(
  text: string,
  maxWidth: number,
  measure: (s: string) => number,
  maxLines = NAME_MAX_LINES,
): { lines: string[]; overflows: boolean } {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return { lines: [], overflows: false };

  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (measure(candidate) <= maxWidth || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
      if (lines.length === maxLines) break;
    }
  }
  if (lines.length < maxLines && current) lines.push(current);

  // Anything that did not fit, plus any single line still too wide.
  const consumed = lines.join(" ").split(/\s+/).filter(Boolean).length;
  const overflows = consumed < words.length || lines.some((l) => measure(l) > maxWidth);

  return { lines: lines.slice(0, maxLines), overflows };
}

/** Left x that centres `width` dots across the label. Never negative. */
export function centreX(width: number): number {
  return Math.max(0, Math.round((LABEL_W - width) / 2));
}

/**
 * Choose the largest font size at which the name fits the column.
 *
 * Extracted from the canvas renderer deliberately: the canvas file has no test
 * coverage (no jsdom, no canvas in this suite), and this is the logic that
 * decides whether a name reaches the QR. Leaving it in there put the fix in the
 * one place CI cannot see.
 *
 * `measureAt(size, text)` supplies real metrics per size — a caller must not
 * assume width scales linearly with point size, because it does not.
 *
 * Returns the chosen size and lines. `stillOverflows` means even the smallest
 * size did not fit, and the caller must clip.
 */
export function fitName(
  name: string,
  maxWidth: number,
  measureAt: (size: number, text: string) => number,
  maxSize = NAME_SIZE,
  minSize = NAME_MIN_SIZE,
): { size: number; lines: string[]; stillOverflows: boolean } {
  let size = maxSize;
  for (;;) {
    const { lines, overflows } = wrapText(name, maxWidth, (t) => measureAt(size, t));
    if (!overflows || size <= minSize) {
      return { size, lines, stillOverflows: overflows };
    }
    size -= 2;
  }
}

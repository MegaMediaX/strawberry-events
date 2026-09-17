/**
 * Which part of a cover survives the crop.
 *
 * Every public surface shows an admin-uploaded cover inside the house
 * cinematic frame, and a frame always crops: the picture is whatever ratio the
 * organiser made it, the frame is 16/6, and something goes. Until this existed
 * what went was chosen by `object-position: center` — so a poster with its
 * subject in the upper third lost the subject, on the index, on the event page
 * and in the emailed link alike, with nobody able to do anything about it.
 *
 * The crop is now a decision. This module is the whole of it: two percentages,
 * clamped, turned into the one CSS property that applies them. Deliberately
 * pure and free of Prisma and React so the same rule can be asserted directly,
 * used in a server component, and used in the admin picker.
 */

/** Percentages of the image's own width and height. 50/50 is dead centre. */
export interface CoverFocus {
  x: number;
  y: number;
}

export const CENTER: CoverFocus = { x: 50, y: 50 };

/**
 * Coerce anything into a usable focus.
 *
 * The values reach here from a database column, a form field and a click on an
 * image, so "anything" is the honest input type. Out of range is clamped
 * rather than rejected: a focus is a preference, and refusing to render a
 * cover because someone stored 120 would take the page down over a nicety.
 * Non-finite input falls back to centre, which is what the crop did before
 * this existed.
 */
export function coverFocus(x: unknown, y: unknown): CoverFocus {
  const axis = (v: unknown): number => {
    // Number(null) is 0 and Number("") is 0, so "no value" would otherwise
    // pin the crop to the top-left CORNER — a plausible-looking result that is
    // nothing like the centre it should fall back to, and one that only shows
    // up on whichever event happens to be missing the column. Rejected before
    // the coercion rather than after it.
    if (v === null || v === undefined || v === "") return 50;
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) return 50;
    return Math.min(100, Math.max(0, Math.round(n)));
  };
  return { x: axis(x), y: axis(y) };
}

/** The CSS `object-position` that crops to this focus. */
export function focusPosition(focus: CoverFocus): string {
  return `${focus.x}% ${focus.y}%`;
}

/**
 * The part of the image that survives a crop to `ratio`, as percentages of the
 * image, given its intrinsic size. Used by the admin picker to show the
 * organiser what they are actually choosing, and exported because that is a
 * claim worth asserting rather than eyeballing.
 *
 * Returns null when the size is unknown — the preview then shows the whole
 * image with no promise about the crop, which is the truth in that case.
 */
export function safeCropBox(
  size: { width: number; height: number } | null,
  focus: CoverFocus,
  ratio: number,
): { left: number; top: number; width: number; height: number } | null {
  if (!size || !(size.width > 0) || !(size.height > 0) || !(ratio > 0)) return null;
  const imageRatio = size.width / size.height;

  // object-cover keeps the whole of the tighter axis and crops the other.
  const [w, h] =
    imageRatio > ratio
      ? [(ratio / imageRatio) * 100, 100] // wider than the frame: sides go
      : [100, (imageRatio / ratio) * 100]; // taller: top and bottom go

  // object-position places the surviving window along the cropped axis: at 0%
  // it is flush left/top, at 100% flush right/bottom.
  return {
    left: ((100 - w) * focus.x) / 100,
    top: ((100 - h) * focus.y) / 100,
    width: w,
    height: h,
  };
}

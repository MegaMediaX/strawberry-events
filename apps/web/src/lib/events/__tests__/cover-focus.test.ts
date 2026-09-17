import { describe, it, expect } from "vitest";
import { coverFocus, focusPosition, safeCropBox, CENTER } from "../cover-focus";

const CINEMA = 16 / 6;

describe("coverFocus", () => {
  it("keeps a usable pair as it is", () => {
    expect(coverFocus(30, 70)).toEqual({ x: 30, y: 70 });
  });

  /**
   * The values arrive from a database column, a form field and a click on an
   * image, so the input type is honestly `unknown` and every one of these has
   * a real source: a string from a form, a float from a click, a null from a
   * column that has not been written yet.
   */
  it.each([
    ["strings from a form post", "25", "80", { x: 25, y: 80 }],
    ["a float from a click", 33.4, 66.6, { x: 33, y: 67 }],
    ["nulls from a column a partial select left out", null, null, CENTER],
    ["undefined", undefined, undefined, CENTER],
    ["an empty form field", "", "", CENTER],
    ["text that is not a number", "left", "top", CENTER],
    ["NaN", NaN, NaN, CENTER],
  ])("coerces %s", (_label, x, y, expected) => {
    expect(coverFocus(x, y)).toEqual(expected);
  });

  /**
   * Clamped, never thrown. A focus is a preference; refusing to render a cover
   * because a column holds 120 would take the event page down over a nicety.
   */
  it.each([
    [-40, 140, { x: 0, y: 100 }],
    [1e9, -1e9, { x: 100, y: 0 }],
    [Infinity, -Infinity, CENTER],
  ])("clamps %s / %s rather than failing", (x, y, expected) => {
    expect(coverFocus(x, y)).toEqual(expected);
  });
});

describe("focusPosition", () => {
  it("is the CSS that actually applies the crop", () => {
    expect(focusPosition(CENTER)).toBe("50% 50%");
    expect(focusPosition({ x: 0, y: 100 })).toBe("0% 100%");
  });
});

/**
 * What the organiser is actually choosing.
 *
 * The admin picker draws this box over their image, so it has to agree with
 * what `object-cover` + `object-position` will really do — an approximate
 * preview is worse than none, because it promises a crop the site does not
 * perform.
 */
describe("safeCropBox", () => {
  it("crops top and bottom on an image taller than the frame", () => {
    const box = safeCropBox({ width: 1600, height: 900 }, CENTER, CINEMA);
    // 16:9 in a 16:6 frame keeps the full width and 6/9 of the height.
    expect(box!.width).toBe(100);
    expect(box!.height).toBeCloseTo(66.67, 2);
    expect(box!.left).toBe(0);
    expect(box!.top).toBeCloseTo(16.67, 2);
  });

  it("crops the sides on an image wider than the frame", () => {
    const box = safeCropBox({ width: 3000, height: 1000 }, CENTER, CINEMA);
    expect(box!.height).toBe(100);
    expect(box!.width).toBeCloseTo(88.89, 2);
    expect(box!.left).toBeCloseTo(5.56, 2);
    expect(box!.top).toBe(0);
  });

  it("keeps everything when the image is already the house ratio", () => {
    expect(safeCropBox({ width: 1600, height: 600 }, CENTER, CINEMA)).toEqual({
      left: 0,
      top: 0,
      width: 100,
      height: 100,
    });
  });

  /** A portrait poster is the case the whole feature exists for. */
  it.each([
    [0, 0],
    [50, 35.9375],
    [100, 71.875],
  ])("slides the window to focus %i%% down a 3:4 poster", (y, expectedTop) => {
    // 0.75 in a 2.667 frame keeps 28.125% of the height — a portrait poster
    // loses over seventy per cent of itself, which is exactly why WHICH
    // seventy per cent has to be someone's decision.
    const box = safeCropBox({ width: 1200, height: 1600 }, { x: 50, y }, CINEMA);
    expect(box!.height).toBeCloseTo(28.125, 4);
    expect(box!.top).toBeCloseTo(expectedTop, 4);
  });

  /** The window never leaves the picture, whatever focus it is given. */
  it.each([
    [{ x: 0, y: 0 }],
    [{ x: 100, y: 100 }],
    [{ x: 50, y: 50 }],
  ])("stays inside the image at focus %o", (focus) => {
    for (const size of [
      { width: 1600, height: 900 },
      { width: 900, height: 1600 },
      { width: 4000, height: 500 },
    ]) {
      const box = safeCropBox(size, focus, CINEMA)!;
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.top).toBeGreaterThanOrEqual(0);
      expect(box.left + box.width).toBeLessThanOrEqual(100.0001);
      expect(box.top + box.height).toBeLessThanOrEqual(100.0001);
    }
  });

  /**
   * Unknown size is the common case for covers uploaded before the dimensions
   * column existed. The picker then shows the whole image and promises nothing
   * about the crop, which is the truth.
   */
  it.each([
    ["no size at all", null],
    ["a zero width", { width: 0, height: 900 }],
    ["a zero height", { width: 1600, height: 0 }],
  ])("returns null for %s", (_label, size) => {
    expect(safeCropBox(size, CENTER, CINEMA)).toBeNull();
  });

  it("returns null for a nonsense frame ratio", () => {
    expect(safeCropBox({ width: 1600, height: 900 }, CENTER, 0)).toBeNull();
  });
});

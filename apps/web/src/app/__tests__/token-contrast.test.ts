import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The palette, measured rather than eyeballed.
 *
 * Contrast is the one design property that is fully decidable from source, and
 * it is the one that had been quietly failing: the brand red as inline link
 * text measured 2.25:1 on a dark card — and that is the styling of the Terms,
 * Privacy and data-use links a registrant has to read before consenting. It
 * was invisible because nobody computes a ratio while reading a hex value.
 *
 * So the ratios are computed here, from the same globals.css the browser
 * loads. A palette edit that drops a pair under its floor fails this file.
 */

const CSS = readFileSync(join(__dirname, "..", "globals.css"), "utf8");

/** Read a custom property out of :root or .dark, whichever block is asked for. */
function token(name: string, theme: "light" | "dark"): string {
  // .dark re-declares a subset; everything else falls through to :root.
  const dark = CSS.slice(CSS.indexOf(".dark {"));
  const light = CSS.slice(CSS.indexOf(":root {"), CSS.indexOf(".dark {"));
  const from = theme === "dark" ? dark : light;
  const hit = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(from);
  if (hit) return hit[1].toLowerCase();
  // dark inherits the light value when it does not override it
  if (theme === "dark") return token(name, "light");
  throw new Error(`token --${name} not found, or not a plain hex`);
}

function luminance(hex: string): number {
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = ch.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Composite a translucent layer over an opaque one, as the browser would. */
function over(fg: string, bg: string, alpha: number): string {
  const part = (i: number) =>
    Math.round(
      parseInt(fg.slice(i, i + 2), 16) * alpha + parseInt(bg.slice(i, i + 2), 16) * (1 - alpha),
    );
  return `#${[1, 3, 5].map((i) => part(i).toString(16).padStart(2, "0")).join("")}`;
}

const TEXT = 4.5;
/** Boundaries of interactive components, and large text. */
const NON_TEXT = 3;

describe.each(["light", "dark"] as const)("%s theme carries its own text", (theme) => {
  const t = (n: string) => token(n, theme);

  it.each([
    ["foreground on background", "foreground", "background"],
    ["foreground on card", "foreground", "card"],
    ["muted-foreground on background", "muted-foreground", "background"],
    ["muted-foreground on card", "muted-foreground", "card"],
    ["muted-foreground on muted", "muted-foreground", "muted"],
    ["primary-foreground on primary", "primary-foreground", "primary"],
    ["brand-success-text on background", "brand-success-text", "background"],
  ])("%s", (_label, fg, bg) => {
    expect(contrast(t(fg), t(bg))).toBeGreaterThanOrEqual(TEXT);
  });

  /**
   * The link red. --primary is a FILL — on a dark card as text it is 2.25:1 —
   * so inline links read --primary-text instead. Checked against every ground
   * a link actually sits on, muted panels included.
   */
  it.each(["background", "card", "muted"])("primary-text on %s", (bg) => {
    expect(contrast(t("primary-text"), t(bg))).toBeGreaterThanOrEqual(TEXT);
  });

  /** The validation message, on the /10 wash it is printed on. */
  it("destructive-text on its own tinted panel", () => {
    const panel = over(t("destructive"), t("background"), 0.1);
    expect(contrast(t("destructive-text"), panel)).toBeGreaterThanOrEqual(TEXT);
  });

  /**
   * A field's edge is the boundary of an interactive component (1.4.11), not a
   * divider. --input is split from --border for exactly this reason: the
   * shared value measured 1.40:1 on the page.
   */
  it.each(["background", "card"])("input border against %s", (bg) => {
    expect(contrast(t("input"), t(bg))).toBeGreaterThanOrEqual(NON_TEXT);
  });

  /** The focus indicator, at the full opacity the border edge renders at. */
  it.each(["background", "card"])("focus ring against %s", (bg) => {
    expect(contrast(t("ring"), t(bg))).toBeGreaterThanOrEqual(NON_TEXT);
  });
});

/**
 * Text set on an ADMIN-UPLOADED cover cannot be checked against a token,
 * because the image is unknown — so the scrim carries it. Worst case is a pure
 * white pixel; the floor is whatever alpha still clears 4.5:1 over it.
 *
 * This is the number the cinematic direction hangs on: it is what makes a
 * title over artwork permissible at all, and event-hero.tsx's existing
 * bg-black/75 badge plate already satisfies it.
 */
describe("the scrim floor over unknown artwork", () => {
  const WHITE = "#ffffff";
  const overBlack = (alpha: number) => contrast(WHITE, over("#000000", WHITE, alpha));

  it("needs at least 55% black under small text", () => {
    expect(overBlack(0.5)).toBeLessThan(TEXT);
    expect(overBlack(0.55)).toBeGreaterThanOrEqual(TEXT);
  });

  it("needs at least 45% black under large display text", () => {
    expect(overBlack(0.4)).toBeLessThan(NON_TEXT);
    expect(overBlack(0.45)).toBeGreaterThanOrEqual(NON_TEXT);
  });

  it("the plate already used for the hero status badge clears both", () => {
    expect(overBlack(0.75)).toBeGreaterThanOrEqual(TEXT);
  });
});

/**
 * ...and the scrim the index plate actually paints.
 *
 * The floors above are arithmetic; these are the tokens. A gradient is the
 * dangerous shape here — it is legible at the foot, where it was designed, and
 * quietly fails wherever the designer did not look. So the assertion is on its
 * WEAKEST stop: every stop of --scrim-cinema must clear the small-text floor,
 * which makes white type legible anywhere in the frame over any cover, rather
 * than only where the title happens to sit today.
 */
describe("the scrim tokens as declared", () => {
  const WHITE = "#ffffff";
  const overBlack = (alpha: number) => contrast(WHITE, over("#000000", WHITE, alpha));

  /** Every colour stop of a gradient token, as `{ alpha, position }`. */
  function stops(name: string): { alpha: number; position: string }[] {
    const decl = new RegExp(`--${name}:([^;]*);`, "s").exec(CSS);
    if (!decl) throw new Error(`token --${name} not found`);
    const found = [...decl[1].matchAll(/rgb\(([^)]*)\)\s*([^,]*)/g)];
    expect(found.length).toBeGreaterThan(1);
    return found.map(([, colour, raw]) => {
      // A position may be a calc(), so it cannot be captured by "up to the
      // next )". Captured up to the next comma instead, then the gradient's
      // own closing paren is trimmed back off.
      let position = raw.trim();
      const unbalanced = (t: string) =>
        (t.match(/\)/g) ?? []).length > (t.match(/\(/g) ?? []).length;
      while (unbalanced(position)) position = position.slice(0, -1).trim();
      // Anything that is not pure black could LIGHTEN the pixel under it,
      // which would break the floor rather than reinforce it.
      const hit = /^\s*0\s+0\s+0\s*\/\s*([\d.]+)\s*$/.exec(colour);
      if (!hit) throw new Error(`--${name} has a non-black stop: rgb(${colour})`);
      return { alpha: Number(hit[1]), position };
    });
  }

  function number(name: string): number {
    const hit = new RegExp(`--${name}:\\s*([\\d.]+);`).exec(CSS);
    if (!hit) throw new Error(`token --${name} not found, or not a plain number`);
    return Number(hit[1]);
  }

  it("--scrim-text is the alpha at which small white text clears 4.5:1", () => {
    expect(overBlack(number("scrim-text"))).toBeGreaterThanOrEqual(TEXT);
  });

  it("--scrim-display is the alpha at which large white text clears 3:1", () => {
    expect(overBlack(number("scrim-display"))).toBeGreaterThanOrEqual(NON_TEXT);
  });

  /**
   * The scrim is painted on the text block, not on the frame, so its geometry
   * is: floor from the bottom up to where the block's top padding starts, then
   * a fade to nothing across that padding. The padding holds no text — it
   * exists so the plate shows no hard edge across the picture — and the
   * component spends the same --scrim-fade for it.
   *
   * So the assertion is: every stop below the fade is at or above the floor,
   * and the ONLY stop that is not is the transparent one at the very top.
   */
  it("--scrim-cinema holds the floor everywhere text can be", () => {
    const floor = number("scrim-text");
    const all = stops("scrim-cinema");
    const top = all[all.length - 1];
    const fadeStart = all[all.length - 2];

    expect(top).toEqual({ alpha: 0, position: "100%" });
    expect(fadeStart.position).toBe("calc(100% - var(--scrim-fade))");

    for (const stop of all.slice(0, -1)) expect(stop.alpha).toBeGreaterThanOrEqual(floor);
    expect(overBlack(Math.min(...all.slice(0, -1).map((s) => s.alpha)))).toBeGreaterThanOrEqual(
      TEXT,
    );
  });

  it("--vignette only ever adds black, so it cannot undo the scrim", () => {
    // `stops` throws on any stop that is not pure black, which is the whole
    // check: the vignette is the one layer that touches the unscrimmed top of
    // the picture, and a light stop there would raise the ground under nothing
    // while lowering the guarantee everywhere.
    const alphas = stops("vignette").map((s) => s.alpha);
    expect(Math.min(...alphas)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...alphas)).toBeGreaterThan(0);
  });
});

/**
 * The paper layer.
 *
 * The attendee flow prints on its own stock rather than the app's cards, so it
 * has its own grounds — and a palette that is correct on --card proves nothing
 * about --paper. The stamp is the case that bites: it is a colour chosen to
 * look like stamped ink, and looking like ink is not the same as being
 * readable on the stock it is struck onto.
 */
describe("paper", () => {
  for (const theme of ["light", "dark"] as const) {
    it(`stamps readable ink on the stock (${theme})`, () => {
      // The stamp's word IS the state — see Stamp in components/paper. That
      // makes it text, and text answers to 4.5:1.
      expect(contrast(token("paper-stamp", theme), token("paper", theme))).toBeGreaterThanOrEqual(
        TEXT,
      );
    });

    it(`prints body copy on the stock (${theme})`, () => {
      expect(contrast(token("paper-ink", theme), token("paper", theme))).toBeGreaterThanOrEqual(
        TEXT,
      );
    });

    it(`keeps secondary copy readable on the stock (${theme})`, () => {
      // The stub sets its labels in --muted-foreground, which was tuned against
      // the page, the card and the muted panel — not against --paper. A stock
      // lighter or darker than all three would slip under the floor here and
      // nowhere else.
      expect(
        contrast(token("muted-foreground", theme), token("paper", theme)),
      ).toBeGreaterThanOrEqual(TEXT);
    });

    it(`gives a field a boundary that clears the non-text floor (${theme})`, () => {
      /*
       * --paper-field is the ONLY visible boundary of a ruled field: there is
       * no box around it. That makes it the boundary of an interactive
       * component, which WCAG 1.4.11 puts at 3:1 — and it is the reason this
       * is a separate token from --paper-rule, which only ever draws dividers
       * and is free to stay quiet.
       */
      expect(contrast(token("paper-field", theme), token("paper", theme))).toBeGreaterThanOrEqual(
        NON_TEXT,
      );
    });

    it(`draws a rule that is visible without pretending to be text (${theme})`, () => {
      // Decorative, so no 4.5:1 — but a rule nobody can see is not a rule. The
      // floor is only that it is distinguishable from the stock at all.
      expect(contrast(token("paper-rule", theme), token("paper", theme))).toBeGreaterThan(1.2);
    });
  }
});

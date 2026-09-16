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

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Red is for things you can press.
 *
 * On the attendee side the strawberry red marks actions — the press, a link —
 * and nothing else. When it also paints the logo, a progress bar and a status
 * stamp, the one thing it is for (where to click) stops standing out. These
 * checks cover the places that had drifted; admin and staff are out of scope.
 */

const SRC = join(__dirname, "..", "..");
const CSS = readFileSync(join(__dirname, "..", "globals.css"), "utf8");

const ATTENDEE_DIRS = [
  "app/[locale]/(public)",
  "app/[locale]/(auth)",
  "components/public",
  "components/registration",
  "components/paper",
  "components/seats",
];

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "__tests__" ? [] : sources(p);
    return /\.tsx?$/.test(name) ? [p] : [];
  });
}

const read = (rel: string) => readFileSync(join(SRC, rel), "utf8");

/** A neutral is a colour whose channels sit within a few steps of each other. */
function isNeutral(hex: string): boolean {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return Math.max(r, g, b) - Math.min(r, g, b) <= 16;
}

describe("red is kept for actions on the attendee side", () => {
  it("sets the wordmark in ink, not red", () => {
    const nav = read("components/public/public-nav.tsx");
    expect(nav).not.toMatch(/tracking-tight text-primary\b/);
    expect(nav).toMatch(/tracking-tight text-foreground/);
  });

  it("prints the stamp in a neutral ink in both themes", () => {
    const light = /:root\s*\{[\s\S]*?--paper-stamp:\s*(#[0-9a-f]{6})/i.exec(CSS)?.[1];
    const dark = /\.dark\s*\{[\s\S]*?--paper-stamp:\s*(#[0-9a-f]{6})/i.exec(CSS)?.[1];
    expect(light && isNeutral(light)).toBe(true);
    expect(dark && isNeutral(dark)).toBe(true);
  });

  it("inks a checked tick rather than filling it red", () => {
    const rule = /\.paper-tick-box\[data-checked\]\s*\{([^}]*)\}/.exec(CSS)?.[1] ?? "";
    expect(rule).not.toMatch(/--primary/);
    expect(rule).toMatch(/--paper-ink/);
  });

  it.each([
    ["components/registration/stepper.tsx"],
    ["components/registration/programme.tsx"],
    ["components/seats/seat-selector.tsx"],
  ])("draws no state or decoration in red in %s", (file) => {
    expect(read(file)).not.toMatch(/var\(--primary\)|\bbg-primary\b/);
  });

  it("uses the link red, never the fill red, for text links", () => {
    // --primary is a fill: as text on the dark ground it measures 2.25:1.
    // A link reads --primary-text, which is tuned to be read.
    const offenders = ATTENDEE_DIRS.flatMap((d) => sources(join(SRC, d))).filter((f) =>
      /\btext-primary(?![-\w/])/.test(readFileSync(f, "utf8")),
    );
    expect(offenders.map((f) => f.slice(SRC.length + 1))).toEqual([]);
  });
});

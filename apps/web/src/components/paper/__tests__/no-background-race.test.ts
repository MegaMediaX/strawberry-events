import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Two backgrounds on one element is a coin toss.
 *
 * `.paper-plate` paints a background. So does every Tailwind `bg-*` utility.
 * Put both on the same element and they are declarations of EQUAL specificity
 * — which one wins is decided by their order in the generated stylesheet, not
 * by anything written at the call site, and that order is not something a
 * reader of the JSX can see.
 *
 * This has now happened twice in this design layer: the WhatsApp button, which
 * could have rendered red instead of green, and a cover band that carried both
 * `paper-plate` and `bg-muted`. Both were caught by eye. This catches the next
 * one by rule.
 *
 * `.paper-edge` is the way out — the printed rule and square corners with no
 * background of its own, for elements that already have one.
 */

const SRC = join(process.cwd(), "src");

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(path, out);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(path);
  }
  return out;
}

/** Every className-ish string literal in the file. */
function classStrings(src: string): string[] {
  return Array.from(src.matchAll(/"([^"\n]*\b(?:paper-plate|paper-press)\b[^"\n]*)"/g)).map(
    (m) => m[1],
  );
}

describe("the paper layer never races two backgrounds", () => {
  it("no element carries both .paper-plate and a bg-* utility", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      for (const cls of classStrings(readFileSync(file, "utf8"))) {
        if (!cls.includes("paper-plate")) continue;
        // `bg-clip-*` and `bg-cover` and friends are not paint; only a colour
        // utility collides with the plate's own background.
        const bg = cls.match(/\bbg-(?!clip-|cover\b|center\b|contain\b|no-repeat\b)[\w[\]()./-]+/);
        if (bg) offenders.push(`${file.replace(SRC, "src")}: "${cls}" → ${bg[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no <Press> paints its own background on top of a painting variant", () => {
    /*
     * The press hazard is NOT the .paper-press class — that one sets geometry
     * only and paints nothing, so a hand-written `paper-press bg-primary` is a
     * single background and perfectly safe. (An earlier version of this test
     * asserted otherwise and flagged exactly that, correctly written, case.)
     *
     * The real race is at the component: `ink` and `ruled` emit a background
     * or a hover wash of their own, so a call site that ALSO passes a bg-*
     * className is stacking two equal-specificity declarations. `quiet` paints
     * nothing, which is the escape the WhatsApp button took.
     */
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const src = readFileSync(file, "utf8");
      for (const tag of src.matchAll(/<Press(?:Link)?\b[^>]*>/g)) {
        const el = tag[0];
        const bg = el.match(/\bbg-(?!clip-|cover\b|center\b|contain\b|no-repeat\b)[\w[\]()./-]+/);
        if (!bg) continue;
        if (/variant=["']quiet["']/.test(el)) continue;
        offenders.push(`${file.replace(SRC, "src")}: ${el.replace(/\s+/g, " ")} -> ${bg[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

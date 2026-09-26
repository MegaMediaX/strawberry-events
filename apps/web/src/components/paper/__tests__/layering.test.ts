import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The paper layer must stay INSIDE @layer components.
 *
 * Tailwind v4 emits its utilities into @layer utilities, and unlayered CSS
 * out-ranks every layer no matter what the selectors say. So a `.paper-*`
 * rule written outside a layer silently beats any utility a call site adds —
 * invisibly, because nothing in the JSX hints at it and the specificities look
 * equal.
 *
 * That is not hypothetical. It shipped three separate defects:
 *   - every variant="ruled" control rendered with a TRANSPARENT border,
 *     because .paper-press's `border: 1px solid transparent` beat the
 *     `border-[color:var(--paper-rule)]` utility on the same element;
 *   - .paper-stamp needed `!` prefixes to reclaim its own tone colours;
 *   - a cover band carrying `paper-plate bg-muted` had two backgrounds whose
 *     winner was decided by emission order.
 *
 * Each was found by eye, one at a time. This is the rule that closes the class.
 */

const CSS = readFileSync(join(__dirname, "..", "..", "..", "app", "globals.css"), "utf8");

/** The layer block (if any) that encloses the given character offset. */
function enclosingLayer(src: string, at: number): string | null {
  let depth = 0;
  let layerAt: { name: string; depth: number } | null = null;
  const layerRe = /@layer\s+([\w-]+)\s*\{/g;
  const starts = new Map<number, string>();
  let m: RegExpExecArray | null;
  while ((m = layerRe.exec(src))) starts.set(m.index + m[0].length - 1, m[1]);

  for (let i = 0; i < at; i++) {
    if (src[i] === "{") {
      if (starts.has(i)) layerAt = { name: starts.get(i)!, depth };
      depth++;
    } else if (src[i] === "}") {
      depth--;
      if (layerAt && depth <= layerAt.depth) layerAt = null;
    }
  }
  return layerAt?.name ?? null;
}

describe("the paper layer is layered", () => {
  it("declares every .paper-* rule inside @layer components", () => {
    const unlayered: string[] = [];
    // Rule-opening selectors only: a `.paper-x` mentioned inside a declaration
    // or comment is not a rule.
    const ruleRe = /^\s*(\.paper-[\w-]+[^{}\n]*)\{/gm;
    let m: RegExpExecArray | null;
    while ((m = ruleRe.exec(CSS))) {
      const layer = enclosingLayer(CSS, m.index);
      if (layer !== "components") {
        unlayered.push(`${m[1].trim()} → ${layer ? `@layer ${layer}` : "UNLAYERED"}`);
      }
    }
    expect(unlayered).toEqual([]);
  });

  it("finds paper rules at all, so the matcher cannot pass vacuously", () => {
    const count = (CSS.match(/^\s*\.paper-[\w-]+[^{}\n]*\{/gm) ?? []).length;
    expect(count).toBeGreaterThan(10);
  });

  it("needs no ! escape hatches, which are the symptom of losing the layer war", () => {
    // A `!` in the paper components means something is out-ranking a call site
    // that should have won — i.e. the layering has regressed.
    const files = ["press.tsx", "stamp.tsx", "plate.tsx", "field.tsx"];
    const offenders = files.filter((f) =>
      /["'`][^"'`]*\B!(?:border|bg|text)-/.test(
        readFileSync(join(__dirname, "..", f), "utf8"),
      ),
    );
    expect(offenders).toEqual([]);
  });
});

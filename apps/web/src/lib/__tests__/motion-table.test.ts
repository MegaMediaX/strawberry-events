import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DUR, EASE, DISSOLVE, dissolve, stepMotion } from "../motion";

/**
 * The motion table, enforced rather than asserted.
 *
 * `lib/motion.ts` has claimed since it was written that "these are the only
 * durations and curves the flow uses". It declared five durations and two
 * easings, three of which nothing imported, and the reduced-motion branch
 * ignored the table entirely and hard-coded 0.12s — while the attendee surface
 * ran twenty motion instances across eleven different durations. A table
 * nobody can spend from is not a table; it is a comment.
 *
 * So the durations now live in two places that CANNOT import each other — a
 * TypeScript module for framer-motion and a stylesheet for the view
 * transitions — and this file is the thing that stops them drifting.
 */
const CSS = readFileSync(join(__dirname, "..", "..", "app", "globals.css"), "utf8");

const cssValue = (name: string): string => {
  const hit = new RegExp(`--${name}:\\s*([^;]+);`).exec(CSS);
  if (!hit) throw new Error(`--${name} is not declared in globals.css`);
  return hit[1].trim();
};

describe("the table has three durations and one easing", () => {
  it("declares exactly three", () => {
    expect(Object.keys(DUR).sort()).toEqual(["base", "quick", "slow"]);
  });

  /** Ordered, because "quick" and "slow" have to mean something. */
  it("orders them", () => {
    expect(DUR.quick).toBeLessThan(DUR.base);
    expect(DUR.base).toBeLessThan(DUR.slow);
  });

  /**
   * The longest anything is allowed to take. Past about half a second a
   * transition stops reading as a cut and starts reading as a wait.
   */
  it("keeps the slowest under half a second", () => {
    expect(DUR.slow).toBeLessThanOrEqual(0.5);
  });

  it("is one curve, decelerating", () => {
    expect(EASE).toHaveLength(4);
    // A curve that ends flat: things arrive and settle rather than overshoot.
    expect(EASE[3]).toBe(1);
  });
});

describe("the stylesheet spends from the same table", () => {
  it.each([
    ["quick", DUR.quick],
    ["base", DUR.base],
    ["slow", DUR.slow],
  ])("--dur-%s matches DUR.%s", (name, seconds) => {
    expect(cssValue(`dur-${name}`)).toBe(`${Math.round(seconds * 1000)}ms`);
  });

  it("--ease matches EASE", () => {
    expect(cssValue("ease")).toBe(`cubic-bezier(${EASE.join(", ")})`);
  });

  /**
   * Every view-transition animation has to spend from the table too. A raw
   * `300ms` here is exactly how the eleven durations happened the first time.
   */
  it("uses no hand-typed duration in the view-transition rules", () => {
    const edit = CSS.slice(CSS.indexOf("::view-transition-old(.dissolve)"));
    const rawTimes = edit.match(/(?<![\w-])\d+m?s(?![\w-])/g) ?? [];
    // 0s appears once, in the reduced-motion kill switch, and is not a duration
    // anyone chose.
    expect(rawTimes.filter((t) => t !== "0s")).toEqual([]);
  });
});

describe("the dissolve is opt-in, and the cut is the default", () => {
  it("names one transition type and no more", () => {
    expect(dissolve()).toEqual([DISSOLVE]);
  });

  /**
   * A shared mutable array handed to the router and mutated anywhere would
   * change what every other link means.
   */
  it("hands out a fresh array each time", () => {
    expect(dissolve()).not.toBe(dissolve());
  });

  /**
   * The rule the registration form depends on. The layout maps only this type
   * to an animation and everything else to "none", so a link that says nothing
   * cuts — which is why nobody has to remember not to dissolve into the form.
   */
  it("is the only type the layout animates", () => {
    const layout = readFileSync(
      join(__dirname, "..", "..", "app", "[locale]", "(public)", "layout.tsx"),
      "utf8",
    );
    // Exactly one type mapped to an animation, and everything else — first
    // loads, the back button, the ticket screen's own router.refresh() —
    // falling to "none".
    expect(layout).toContain('update={{ [DISSOLVE]: DISSOLVE, default: "none" }}');
    expect(layout).toContain('default="none"');

    // `update`, specifically. This element is in a LAYOUT, so it persists
    // across the routes it wraps and never mounts or unmounts: written with
    // enter/exit it typechecked, built, and animated nothing.
    expect(layout).not.toMatch(/\benter=\{/);
    expect(layout).not.toMatch(/\bexit=\{/);
  });

  it("is spent by the index's links and by nothing into the form", () => {
    const src = (...p: string[]) => readFileSync(join(__dirname, "..", "..", ...p), "utf8");
    expect(src("components", "public", "featured-event-plate.tsx")).toContain(
      "transitionTypes={dissolve()}",
    );
    expect(src("components", "public", "event-card.tsx")).toContain(
      "transitionTypes={dissolve()}",
    );
    // The two routes into registration.
    for (const file of ["ticket-rail.tsx", "mobile-cta-bar.tsx"]) {
      expect(src("components", "public", file)).not.toContain("transitionTypes");
    }
  });
});

describe("stepMotion", () => {
  /** The 0.12s that used to be typed here is the reason this file exists. */
  it("spends from the table in both branches", () => {
    const durations = (m: ReturnType<typeof stepMotion>) => [
      (m.animate.transition as { duration: number }).duration,
      (m.exit.transition as { duration: number }).duration,
    ];
    for (const m of [stepMotion(true), stepMotion(false)]) {
      for (const d of durations(m)) {
        expect(Object.values(DUR) as number[]).toContain(d);
      }
    }
  });

  it("uses the one easing everywhere, arriving and leaving", () => {
    for (const m of [stepMotion(true), stepMotion(false)]) {
      expect((m.animate.transition as { ease: unknown }).ease).toBe(EASE);
      expect((m.exit.transition as { ease: unknown }).ease).toBe(EASE);
    }
  });

  /** The reduced twin moves nothing — opacity only, no transform to speak of. */
  it("drops every transform under reduced motion", () => {
    const m = stepMotion(true);
    expect(m.initial).toEqual({ opacity: 0 });
    expect(JSON.stringify(m)).not.toContain('"y"');
  });

  it("moves vertically when motion is allowed, never horizontally", () => {
    const m = JSON.stringify(stepMotion(false));
    expect(m).toContain('"y"');
    expect(m).not.toContain('"x"');
  });
});

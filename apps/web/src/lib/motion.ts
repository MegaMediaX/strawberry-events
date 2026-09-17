/**
 * The motion table. Three durations, one easing, and nothing else.
 *
 * This file used to say "these are the only durations and curves the flow
 * uses" while declaring five durations and two easings, three of which nothing
 * imported — and the reduced-motion branch below ignored the table entirely
 * and hard-coded 0.12s. Meanwhile the attendee surface ran twenty motion
 * instances across eleven different durations, because a table nobody can
 * spend from is not a table.
 *
 * Stages 0 to 3 deleted most of those instances rather than retiming them: the
 * hero's entrance, the ticket's every-view entrance, two hover transforms. What
 * is left is small enough that the table can finally be true, and narrow enough
 * that it can be enforced — `app/globals.css` declares the same three
 * durations and the same curve as custom properties, and
 * `__tests__/motion-table.test.ts` fails if the two ever disagree.
 *
 * Three, because a scene change needs a length, a state change needs a shorter
 * one, and a reveal needs a longer one. One easing, because a second curve is a
 * second opinion about what the product's motion feels like.
 */

/** The only easing. Decelerating: things arrive and settle, never overshoot. */
export const EASE = [0.22, 1, 0.36, 1] as const;

/** The only three durations, in seconds — framer-motion's unit. */
export const DUR = {
  /** A state change, and every reduced-motion twin. */
  quick: 0.14,
  /** A step, a swap, a cut between scenes. */
  base: 0.28,
  /** A reveal. The longest anything is allowed to take. */
  slow: 0.42,
} as const;

/**
 * The one transition type the site names.
 *
 * Absence of a type is a CUT, and that is load-bearing: the registration form
 * must never dissolve, and the way it never dissolves is that nothing tags a
 * link into it. A rule that has to be remembered at each call site is a rule
 * that gets forgotten at one of them; this one is the default.
 *
 * A fresh mutable array per call, because `transitionTypes` on <Link> is typed
 * `string[]` and a shared `as const` tuple is not assignable to it — and a
 * shared mutable array would be worse: one handed to the router and mutated
 * anywhere would change what every other link means.
 */
export function dissolve(): string[] {
  return ["dissolve"];
}

/** The name the CSS and the layout both spell. */
export const DISSOLVE = "dissolve";

/**
 * Step-to-step transition inside the registration wizard.
 *
 * Vertical rather than horizontal: a horizontal slide reads as a carousel and
 * would need mirroring per writing direction, while vertical reads as depth and
 * is direction-agnostic.
 *
 * Deliberately NOT named variants. Variant labels propagate down the motion
 * tree. The step body contains <Programme>'s motion.spans, which define no
 * "exit" variant, so an exiting step under <AnimatePresence mode="wait"> waits
 * forever on children that never report finished: the step freezes at its
 * initial style and the next step never mounts. Plain objects do not propagate,
 * so the container animates alone.
 *
 * The cost is that staggerChildren is unavailable (it requires variants). That
 * was the first item on the motion cut list anyway.
 */
export function stepMotion(reduce: boolean) {
  if (reduce) {
    // Opacity only, and from the table rather than from a number typed here.
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1, transition: { duration: DUR.quick, ease: EASE } },
      exit: { opacity: 0, transition: { duration: DUR.quick, ease: EASE } },
    };
  }
  return {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0, transition: { duration: DUR.base, ease: EASE } },
    // The same curve leaving as arriving. A mirrored curve for exits is the
    // conventional choice and it is a second easing, which is the thing this
    // table exists to refuse.
    exit: { opacity: 0, y: -8, transition: { duration: DUR.quick, ease: EASE } },
  };
}

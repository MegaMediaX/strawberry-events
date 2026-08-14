/**
 * Shared motion language for the registration flow.
 *
 * Before this existed, `event-card.tsx` defined its own local EASE and
 * everything else passed the string "easeOut", so no two surfaces agreed on
 * timing. These are the only durations and curves the flow uses.
 */

export const EASE_OUT = [0.22, 1, 0.36, 1] as const;
export const EASE_IN = [0.32, 0.72, 0, 1] as const;

export const DUR = {
  tap: 0.09,
  micro: 0.14,
  base: 0.22,
  enter: 0.28,
  slow: 0.42,
} as const;

/**
 * Step-to-step transition. Vertical rather than horizontal: a horizontal slide
 * reads as a carousel and would need mirroring per writing direction, while
 * vertical reads as depth and is direction-agnostic.
 *
 * Under reduced motion every transform collapses to zero and only opacity
 * moves, at a single short duration.
 */
/**
 * Step transition props, as plain objects — deliberately NOT named variants.
 *
 * Variant labels propagate down the motion tree. The step body contains
 * <Programme>'s motion.spans, which define no "exit" variant, so an exiting
 * step under <AnimatePresence mode="wait"> waits forever on children that never
 * report finished: the step freezes at its initial style and the next step
 * never mounts. Plain objects do not propagate, so the container animates
 * alone.
 *
 * The cost is that staggerChildren is unavailable (it requires variants). That
 * was the first item on the motion cut list anyway.
 */
export function stepMotion(reduce: boolean) {
  if (reduce) {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1, transition: { duration: 0.12 } },
      exit: { opacity: 0, transition: { duration: 0.12 } },
    };
  }
  return {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0, transition: { duration: DUR.enter, ease: EASE_OUT } },
    exit: { opacity: 0, y: -8, transition: { duration: DUR.micro, ease: EASE_IN } },
  };
}



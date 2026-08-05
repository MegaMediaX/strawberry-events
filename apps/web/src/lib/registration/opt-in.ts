/**
 * Opt-in session categories.
 *
 * Some session categories (e.g. "Workshops") are hidden in the registration
 * Sessions step until the attendee ticks the matching toggle in the Tickets
 * step. A category is gated when ANY of its sub-events sets `requiresOptIn`,
 * so an organiser adding a workshop on the go only has to tick the flag on the
 * new row — the category gate follows automatically.
 *
 * Pure and dependency-free: exercised by the unit suite and reused by the
 * wizard without pulling in React or Prisma.
 */

export interface OptInSubEvent {
  category: string;
  requiresOptIn?: boolean;
  pretixItemId: number | null;
}

/**
 * Categories that require an explicit opt-in, in first-appearance order so the
 * toggles render in the same order as the picker groups them.
 */
export function gatedCategories(subEvents: OptInSubEvent[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const se of subEvents) {
    if (!se.requiresOptIn) continue;
    if (seen.has(se.category)) continue;
    seen.add(se.category);
    out.push(se.category);
  }
  return out;
}

/**
 * Sub-events visible for the current opt-in state: everything from ungated
 * categories, plus gated categories the attendee has opted into.
 */
export function visibleSubEvents<T extends OptInSubEvent>(
  subEvents: T[],
  optedIn: readonly string[],
): T[] {
  const gated = new Set(gatedCategories(subEvents));
  const chosen = new Set(optedIn);
  return subEvents.filter((se) => !gated.has(se.category) || chosen.has(se.category));
}

/**
 * Drop selections whose session is no longer visible — un-ticking "Workshops"
 * must not leave a hidden workshop in the order.
 */
export function pruneSelection<S extends { itemId: number }>(
  selection: S[],
  visible: OptInSubEvent[],
): S[] {
  const allowed = new Set(
    visible
      .filter((se) => se.pretixItemId !== null)
      .map((se) => se.pretixItemId as number),
  );
  return selection.filter((s) => allowed.has(s.itemId));
}

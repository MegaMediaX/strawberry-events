/**
 * The door's "Just now" list, kept across a reload.
 *
 * It held the last few admissions in component state only, so a reload, a
 * laptop waking from sleep or a crashed tab emptied it — and with it went the
 * Fix and Reprint path for the three people who had just walked in, which is
 * exactly the window in which a misspelt badge is noticed. Recovering then
 * meant searching for someone already inside.
 *
 * `sessionStorage`, like the registration draft: it carries attendee names, and
 * a tab-scoped store clears itself when the tab closes rather than leaving them
 * on a shared door laptop. Nothing here is a credential — an order code opens
 * no ticket on its own (see lib/registration/attendee-view) — and everything in
 * it was on screen a moment ago.
 *
 * Per event and per check-in list: two lanes on two days must not show each
 * other's history.
 */

export interface RecentEntry {
  id: number;
  orderCode: string;
  name: string;
  kind: "in" | "reprint";
  /** Already formatted for display — the door shows a wall clock, not an ISO. */
  at: string;
}

export function recentKey(eventId: string, listId: number): string {
  return `strawberry:door-recent:${eventId}:${listId}`;
}

function store(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function saveRecent(eventId: string, listId: number, entries: RecentEntry[]): void {
  try {
    store()?.setItem(recentKey(eventId, listId), JSON.stringify(entries));
  } catch {
    // A full or disabled store must not interrupt a queue.
  }
}

export function clearRecent(eventId: string, listId: number): void {
  try {
    store()?.removeItem(recentKey(eventId, listId));
  } catch {
    // ignore
  }
}

/**
 * Read the list back, dropping anything malformed.
 *
 * Re-checked rather than trusted: the value is user-writable, and a stray entry
 * would render a Fix and a Reprint button against whatever it contained.
 */
export function loadRecent(eventId: string, listId: number): RecentEntry[] {
  let raw: string | null = null;
  try {
    raw = store()?.getItem(recentKey(eventId, listId)) ?? null;
  } catch {
    return [];
  }
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry) => {
      if (typeof entry !== "object" || entry === null) return [];
      const { id, orderCode, name, kind, at } = entry as Record<string, unknown>;
      if (typeof id !== "number" || !Number.isFinite(id)) return [];
      if (typeof orderCode !== "string" || orderCode === "") return [];
      if (typeof name !== "string") return [];
      if (kind !== "in" && kind !== "reprint") return [];
      if (typeof at !== "string") return [];
      return [{ id, orderCode, name, kind, at }];
    });
  } catch {
    return [];
  }
}

import type { RegistrationState } from "@/lib/approval/state";

/**
 * Whether this screen should watch for its own ticket to arrive.
 *
 * Payment-pending and approval-pending are both waiting rooms: the attendee's
 * spot is reserved, someone else acts, and the QR appears. The page never
 * found that out. It is `force-dynamic`, so the data is only as fresh as the
 * request that fetched it — the attendee sat on "Payment pending" while an
 * organiser marked them paid on the other side of the room, and the only way
 * through was to think of reloading. That is a conversion gap before it is
 * anything to do with cinema.
 *
 * Only the two pending states poll. An issued ticket has nothing left to wait
 * for, and rejected and canceled are endings — repolling either would be this
 * screen asking, every twenty seconds, whether someone has changed their mind.
 */
export function shouldWatchForTicket(state: RegistrationState): boolean {
  return state === "pending_payment" || state === "pending_approval";
}

/** How often to ask, and for how long. */
export const WATCH_INTERVAL_MS = 20_000;

/**
 * Stop after roughly ten minutes of looking.
 *
 * Approval can take a day; a tab left open overnight must not spend the night
 * refreshing a `force-dynamic` route that queries pretix. Ten minutes covers
 * the case this is actually for — the attendee is at the desk, or just paid,
 * and is watching the screen — and anyone who waits longer than that has
 * stopped watching and will reload when they come back.
 */
export const WATCH_LIMIT = 30;

/**
 * Whether this is the FIRST time this browser has opened this ticket.
 *
 * The ticket screen played its entrance on every view. That link is emailed,
 * and the thing people do with it is open it again — on the train, at the
 * door, and once more while the scanner is pointed at it. An animation that
 * plays on the tenth open is not a reveal; it is a delay in front of a
 * barcode, in a queue.
 *
 * Keyed per order code because that is what identifies the ticket to the
 * person holding it: two tickets in one inbox are two payoffs, and one ticket
 * reopened is one.
 *
 * Kept pure and storage-agnostic so the rule can be asserted directly. The
 * component passes real localStorage; the tests pass fakes, including ones
 * that throw — which is not hypothetical, since Safari's private mode throws
 * on write and a browser with site data blocked throws on read.
 */

/** Namespaced so it cannot collide with anything else this origin stores. */
export const REVEAL_KEY_PREFIX = "strawberry.ticket-seen.";

/** The two localStorage methods this needs, and nothing else. */
export interface RevealStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * True exactly once per order code, per browser.
 *
 * Every failure answers FALSE — no reveal. A ticket that quietly skips its
 * animation is a ticket; a ticket that replays it at the door is the bug this
 * exists to fix, so when storage cannot be trusted the safe answer is the
 * plain one. That includes the case where the write throws after the read
 * succeeded: without a record, the next view would animate again, so it is
 * treated as already seen.
 */
export function claimFirstView(orderCode: string, store: RevealStore | null): boolean {
  if (!store || !orderCode) return false;
  const key = `${REVEAL_KEY_PREFIX}${orderCode}`;
  try {
    if (store.getItem(key) !== null) return false;
    store.setItem(key, "1");
    return true;
  } catch {
    return false;
  }
}

/**
 * localStorage, or null where it cannot be reached.
 *
 * Accessing `window.localStorage` THROWS outright in a browser with site data
 * blocked — it is not merely absent — so even the lookup needs a guard.
 */
export function browserRevealStore(): RevealStore | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

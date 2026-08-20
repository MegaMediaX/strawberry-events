/**
 * Which print result is still allowed to touch the door screen.
 *
 * `pending` on the check-in transition covers only the network call, not the
 * print. At door throughput an operator starts the next attendee while the
 * previous badge is still emerging, so prints for different people overlap.
 *
 * Without an ownership rule the last print to RESOLVE wins the shared banner
 * and fallback panel — which is not the same as the last attendee the operator
 * actually served. The observed failure: attendee A's print fails slowly,
 * attendee B checks in meanwhile, and A's failure renders under B's name while
 * A walks away badgeless believing they are done.
 *
 * Each attempt claims a ticket; only the newest ticket may write to the screen.
 */
export function createPrintOwnership() {
  let current = 0;

  return {
    /** Claim the screen for a new print. Supersedes every earlier claim. */
    claim(): number {
      current += 1;
      return current;
    },
    /** May this attempt still write to the screen? */
    owns(ticket: number): boolean {
      return ticket === current;
    },
  };
}

export type PrintOwnership = ReturnType<typeof createPrintOwnership>;

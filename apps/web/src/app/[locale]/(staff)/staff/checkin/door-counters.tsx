"use client";

import { useEffect, useState } from "react";

import { counterAction, type DoorCounters } from "./actions";

/** Slow enough not to add traffic to a busy door, fast enough to stay true. */
const POLL_MS = 30_000;

/**
 * The running count at the top of the door screen.
 *
 * Server-rendered once, this was the figure from before the doors opened for
 * the rest of the shift — and it is the number staff get asked for all day.
 * It is a client component so it can poll, seeded from the server render so
 * the first paint carries the real number rather than a dash.
 *
 * The seed is only ever an INITIAL value — React keeps the state it has — so
 * the page gives this a key per lane. Switching check-in day is a client
 * navigation that keeps the panel mounted, and without the key a new day's
 * server figure was ignored: the previous day's count stayed on screen, and
 * `bumpDoorCount` incremented that wrong number.
 *
 * Two things move it: a poll, and the panel itself, which bumps it on each
 * admission (see `bumpDoorCount`) so the number responds immediately rather
 * than up to thirty seconds later.
 */
export function DoorCounters({
  eventId,
  listId,
  initial,
}: {
  eventId: string;
  listId: number;
  initial: DoorCounters;
}) {
  const [counters, setCounters] = useState(initial);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      // The action catches its own failures, but a dropped connection rejects
      // the CALL — which this runs every 30s, so a flaky door network meant an
      // unhandled rejection per tick, and a dev overlay over the door screen.
      // Same reasoning as `connectionLost` in the panel.
      const next = await counterAction(eventId, listId).catch((err: unknown) => {
        console.error("[door] counterAction call rejected", err);
        return null;
      });
      // null means the figure could not be fetched. Keep the last known one:
      // zeros on a door screen read as "the event has not started".
      if (!cancelled && next) setCounters(next);
    };

    // Immediately, not only every 30s: the server figure this was seeded with
    // is as old as the page, and a lane that has been open a while is looking
    // at it until the first tick.
    void run();
    const id = setInterval(() => void run(), POLL_MS);
    const onBump = () => setCounters((c) => ({ ...c, checkedIn: c.checkedIn + 1 }));
    window.addEventListener(BUMP_EVENT, onBump);

    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener(BUMP_EVENT, onBump);
    };
  }, [eventId, listId]);

  return (
    <>
      {/* aria-live off: this changes on every admission, and a door screen
          already announces each outcome through the result banner. */}
      <span className="tabular-nums">
        Checked in {counters.checkedIn} / {counters.total}
      </span>
    </>
  );
}

const BUMP_EVENT = "strawberry:door-checked-in";

/**
 * Tell the counter someone just went in.
 *
 * A window event rather than shared state: the counter sits in the page's
 * server-rendered header, above and outside the panel, and threading state up
 * through a server component is not possible. The next poll reconciles, so a
 * missed or double-counted bump corrects itself within thirty seconds.
 */
export function bumpDoorCount(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(BUMP_EVENT));
}

import { describe, it, expect } from "vitest";
import {
  shouldWatchForTicket,
  WATCH_INTERVAL_MS,
  WATCH_LIMIT,
} from "../ticket-refresh";

describe("shouldWatchForTicket", () => {
  /**
   * The two waiting rooms. Someone else acts and the QR appears; until this
   * existed the attendee had to guess that reloading was their job.
   */
  it.each(["pending_payment", "pending_approval"] as const)("watches while %s", (state) => {
    expect(shouldWatchForTicket(state)).toBe(true);
  });

  /** Nothing left to wait for, or an ending. */
  it.each(["issued", "rejected", "canceled"] as const)("does not watch when %s", (state) => {
    expect(shouldWatchForTicket(state)).toBe(false);
  });
});

describe("the watch budget", () => {
  /**
   * A tab left open overnight must not spend the night refreshing a
   * force-dynamic route that queries pretix on every hit.
   */
  it("gives up after about ten minutes", () => {
    const totalMs = WATCH_INTERVAL_MS * WATCH_LIMIT;
    expect(totalMs).toBeGreaterThanOrEqual(5 * 60_000);
    expect(totalMs).toBeLessThanOrEqual(15 * 60_000);
  });

  it("asks rarely enough to be free, often enough to be noticed", () => {
    expect(WATCH_INTERVAL_MS).toBeGreaterThanOrEqual(10_000);
    expect(WATCH_INTERVAL_MS).toBeLessThanOrEqual(60_000);
  });
});

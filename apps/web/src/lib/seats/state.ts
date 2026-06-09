import type { SeatState } from "@prisma/client";

/** Temporary seat-hold duration: 10 minutes. */
export const HOLD_MS = 600_000;

export interface SeatLike {
  state: SeatState;
  heldUntil: Date | null;
}

/** A hold has expired when a temporarily_held seat's heldUntil is in the past. */
export function isHoldExpired(seat: SeatLike, now: Date = new Date()): boolean {
  return (
    seat.state === "temporarily_held" &&
    !!seat.heldUntil &&
    seat.heldUntil.getTime() < now.getTime()
  );
}

/**
 * Whether a seat can be selected: available/accessible always; a temporarily_held
 * seat only if its hold has expired. blocked/sold are never selectable.
 */
export function canSelect(seat: SeatLike, now: Date = new Date()): boolean {
  if (seat.state === "available" || seat.state === "accessible") return true;
  if (seat.state === "temporarily_held") return isHoldExpired(seat, now);
  return false;
}

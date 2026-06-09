# Seat Maps + Waitlist (Milestone 9) Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Optional per-event reserved seating (visual selector + 10-min holds, synced to pretix) and a waitlist (join/position/promote) for full events.

**Architecture:** Custom seat tables are the source of truth. `lib/seats/service.ts` owns hold/confirm/release with expiry; `lib/waitlist/service.ts` owns join/promote (guarded). UI: `SeatSelector` + wizard step; `WaitlistJoin`; admin waitlist queue.

Spec: `docs/superpowers/specs/2026-06-09-seats-waitlist-design.md`

---

## Chunk 1: schema + seat-state helpers (TDD)

### Task 1: schema
- [ ] `EventMapping.seatSelectionEnabled Boolean @default(false)`, `waitlistEnabled Boolean @default(false)`; new `WaitlistEntry` + enum `WaitlistStatus { waiting promoted converted canceled }`. Migration `add_seats_waitlist` (dev :5433); regen client. Commit.

### Task 2: seat-state helpers (TDD)
- [ ] `lib/seats/state.ts`: `isHoldExpired(seat, now)`, `canSelect(seat)` (available/accessible & not expired-held-by-other), `HOLD_MS=600000`. Tests. Commit.

---

## Chunk 2: seat service (TDD)

### Task 3: getSeatMap + releaseExpiredHolds
- [ ] `lib/seats/service.ts` `getSeatMap(eventId)` (releases expired holds first, returns nested sections/rows/seats). Tests (mock prisma). Commit.

### Task 4: holdSeats / confirmSeats / releaseSeats
- [ ] Tests: holdSeats sets available→temporarily_held+heldUntil, rejects if any not available; confirmSeats held→sold_or_reserved w/ attendeeRef; releaseSeats →available. Implement. Commit.

---

## Chunk 3: waitlist service (TDD)

### Task 5: joinWaitlist + listWaitlist + promote
- [ ] Tests (mock prisma + email + audit): join assigns next position + dedupe; promote requires organizer/super (finance/staff/impersonating rejected), cross-org denied, sets promoted + email + audit. Implement `lib/waitlist/service.ts`. Commit.

---

## Chunk 4: UI + integration

### Task 6: SeatSelector + wizard seat step
- [ ] `components/seats/seat-selector.tsx` (state colors, click→hold action, 10-min countdown). Wizard: insert seat step when `seatSelectionEnabled`; confirm seats on submit. Seat hold/confirm server actions. `npm run build`. Commit.

### Task 7: WaitlistJoin + admin waitlist queue
- [ ] `WaitlistJoin` (email form) shown on sold-out when `waitlistEnabled`; `joinWaitlistAction`. Admin `/admin/events/[id]/waitlist` (list + promote button, impersonation-disabled, role-guarded). `npm run build`. Commit.

---

## Chunk 5: integration + verify

### Task 8: integration (real DB)
- [ ] Gated `TEST_DATABASE_URL`: seat hold→confirm→release; waitlist join→position→promote; cross-org promote denied. Commit.

### Task 9: full verify + docs
- [ ] lint + typecheck + test + smoke + build green; integration vs dev DB. README (seats/holds/GA, waitlist, permissions). Commit.

---

## Notes
- DRY: seat transitions centralized in `seats/state.ts` + `seats/service.ts`. YAGNI: no auto-promote, no seat-map editor, no payment-deadline auto-release.
- TDD on state helpers, seat service, waitlist service. UI by build.

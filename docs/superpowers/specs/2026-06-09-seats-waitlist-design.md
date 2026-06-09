# Milestone 9 — Seat Maps + Waitlist Design

**Date:** 2026-06-09
**Status:** Scope confirmed (custom seat-map layer; seats + waitlist)
**Depends on:** M1–M8.

---

## 1. Goal

Optional per-event reserved seating with a visual selector + temporary holds, and a
waitlist for full events/tickets. Custom seat tables are the source of truth for the
selector; chosen seats sync to pretix order positions.

## 2. Seat model (existing tables)

`SeatMap → SeatSection → SeatRow → SeatAssignment` already exist. `SeatAssignment` has
`state` (available|temporarily_held|sold_or_reserved|blocked|accessible), `heldUntil`,
`pretixOrderId`, `attendeeRef`, unique `(rowId,label)`.

Add `EventMapping.seatSelectionEnabled Boolean @default(false)` — GA events skip seats.

## 3. Seat states + holds

- **available** → selectable.
- **temporarily_held** (`heldUntil = now + 10min`) → reserved during checkout; expires.
- **sold_or_reserved** → confirmed (order created; COD reserved until cancel).
- **blocked** / **accessible** → not freely selectable / marked accessible.

`releaseExpiredHolds(eventMapId)`: any `temporarily_held` with `heldUntil < now` → available.
Called on seat-map read and before holding.

## 4. Seat service (`lib/seats/service.ts`)

- `getSeatMap(eventId)` → sections/rows/seats (after releasing expired holds).
- `holdSeats(eventId, seatIds, holderRef)` → atomically set available→temporarily_held
  with `heldUntil`; throws if any not available. Returns held seats + expiry.
- `confirmSeats(eventId, seatIds, orderCode)` → temporarily_held(by holder)→sold_or_reserved,
  set `attendeeRef`/`pretixOrderId`.
- `releaseSeats(orderCode | seatIds)` → back to available (on cancel/expiry).
- Pure helper `isHoldExpired(seat, now)` and `nextState` transitions (TDD).

## 5. Waitlist model (new)

`WaitlistEntry`: `id, eventMappingId, itemId Int?, email, userId String?, position Int,
status (waiting|promoted|converted|canceled), createdAt, promotedAt`. Migration.
Add `EventMapping.waitlistEnabled Boolean @default(false)`.

## 6. Waitlist service (`lib/waitlist/service.ts`)

- `joinWaitlist(eventId, email, itemId?)` → next position (max+1 for that event/item),
  status waiting. Dedupe by (event,email,item).
- `listWaitlist(session, eventId)` (org-scoped, admin).
- `promote(session, entryId)` → status promoted + promotion email; guards: organizer_admin/
  super_admin only, impersonating blocked, cross-org denied, audited.
  (Auto-promotion deferred; manual now.)

## 7. Registration + public integration

- Wizard: if `seatSelectionEnabled`, add a **Seat selection** step (visual selector) after
  ticket selection; holds seats on select; on submit, `confirmSeats(orderCode)`.
- On full availability / sold out: if `waitlistEnabled`, show **Join waitlist** (email) →
  `joinWaitlist`; confirmation page shows waitlist position.
- COD reserved seats stay `sold_or_reserved` until cancel; expiry only applies to holds.

## 8. UI

`SeatSelector` (client): renders sections/rows; seat color by state; click to select
(calls hold action) with a 10-min countdown; disabled for blocked/sold. `WaitlistJoin`
(email form). Admin `/admin/events/[id]/waitlist` (list + promote). RTL-aware, themed.

## 9. Permissions

Seat hold/confirm: public (holder ref = session user id or a guest token). Waitlist promote:
organizer_admin/super_admin only; finance/staff cannot; impersonating blocked; cross-org denied.

## 10. Tests

- hold transitions + expiry (pure); holdSeats rejects taken seat; confirm/release.
- waitlist position increments; dedupe; promote guards (role/impersonation/cross-org); email fires.
- registration with seats confirms held seats; GA event skips seats.
- integration (real DB): hold → confirm → release; join → promote.

## 11. Docs

README: seat states + 10-min holds, GA vs seated, waitlist (join/position/promote),
permissions.

## 12. Out of scope

Auto-promotion, seat-map visual editor (admin builds via data/import later), payment-deadline
auto-release (release on cancel only), accessible-seat booking rules beyond marking.

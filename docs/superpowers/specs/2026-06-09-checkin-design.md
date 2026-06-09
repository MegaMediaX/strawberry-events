# Milestone 8 — Staff Check-in + 4×6 Badge Printing Design

**Date:** 2026-06-09
**Status:** Scope confirmed (full hybrid; pretix check-in lists = source of truth)
**Depends on:** M1–M7.

---

## 1. Goal

Operational check-in for staff: a custom browser print-station (search/scan →
validate eligibility → check in → auto-print 4×6 badge → reprint) **and** pretixSCAN
integration (device/gate config + webhooks). pretix check-in lists are the source of
truth for check-in state; badges/print logs are local.

## 2. Eligibility rule

An attendee may be checked in only when issued: `registrationState(order) === "issued"`
(i.e. paid + approved/not_required). Pending-payment, pending-approval, rejected, and
canceled are rejected with a clear reason. Duplicate check-in is surfaced (already in).

## 3. Role tag (badge)

Add `AttendeeOrder.roleTag AttendeeTag @default(visitor)` — set at registration from the
selected ticket's configured tag (per-event `EventMapping.itemTagMap Json` mapping pretix
itemId → tag). Badge template chosen by `roleTag`. (`BadgeTemplate` table already exists,
keyed by `AttendeeTag`.)

## 4. pretix adapter additions (source of truth)

- `redeemCheckin(org, ev, listId, secret, token)` → POST `…/checkinlists/{id}/positions/{secret}/redeem/` (or `/checkins/`), returns `{status:"ok"|"error", reason?}`.
- `listCheckinPositions(org, ev, listId, token)` / counts for live counters.
- Implement `webhooks.verifyWebhook` (currently NotImplemented): validate a shared
  secret (`PRETIX_WEBHOOK_SECRET`, sent as a query token or header) + parse payload.

## 5. Check-in service (`lib/checkin/service.ts`)

- `searchAttendees(session, eventId, query)` — scoped; find AttendeeOrders by code/email/name.
- `checkInOrder(session, eventId, orderCode, listId)`:
  1. Require role `checkin_staff | organizer_admin | super_admin`; block impersonating.
  2. Scoped event access (`canAccessEvent`; staff limited to assignedEventIds).
  3. Resolve order; assert `issued` (else reject with reason).
  4. `redeemCheckin` against pretix list (source of truth); handle already-checked-in.
  5. Write `BadgePrintLog` (auto-print) + audit `attendee.checked_in`.
- `liveCounters(session, eventId, listId)` — totals + checked-in from pretix.

## 6. Badge components

- `BadgeTemplate.tsx` — 4×6 (`@page { size: 4in 6in }`) print CSS; top role TAG
  (color per tag), Full Name, Company, QR. Per-tag visual differentiation.
- `BadgePrintDialog.tsx` — triggers `window.print()`; auto-print after successful scan
  (event setting `badgeAutoPrint`) + manual reprint button.

## 7. Staff routes

- `/staff` — assigned events.
- `/staff/checkin` — select event + check-in list/gate → search/scan box → attendee card
  (first/last/company/tag/status) → Check in → badge auto-print → reprint. Live counters.
- `/staff/badges` — reprint by search; template preview per tag.
- Staff layout gated to `checkin_staff | organizer_admin | super_admin`; staff see only
  assigned events. (Admins may also use it.)

## 8. pretixSCAN + webhooks

- `/api/webhooks/pretix` — POST endpoint; `verifyWebhook` checks the shared secret; on
  `checkin`/`order.paid` events, records/updates local counters cache + optional badge log.
  (Browser auto-print can't be server-triggered — documented; pretixSCAN-native printing or
  the custom station does physical printing.)
- README: pretixSCAN device setup (organizer, check-in list, token) + webhook URL/secret.

## 9. Permissions

super_admin/organizer_admin: all assigned. checkin_staff: only `assignedEventIds`; no
finance/settings/approvals. Impersonating blocked for check-in mutations. Cross-org denied.

## 10. Tests

- eligibility: issued → ok; pending_payment/pending_approval/rejected/canceled → rejected.
- badge tag selection by roleTag; reprint writes BadgePrintLog.
- check-in service: staff assigned-event only; cross-org denied; impersonating blocked;
  duplicate check-in surfaced.
- webhook verifyWebhook: valid secret parses; bad secret rejected.
- live counters aggregation.
- integration (real DB + mocked pretix): check-in writes log + audit.

## 11. Docs

README: check-in flow, eligibility, badge spec (4×6, tags), staff routes/permissions,
pretixSCAN + webhook setup.

## 12. Out of scope

Walk-in quick-register (later), session/workshop check-in (M with sessions), offline mode,
physical printer drivers (browser print only), real pretixSCAN app config beyond docs.

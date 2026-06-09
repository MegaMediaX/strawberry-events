# Milestone 6 — Payments + Finance UI Design

**Date:** 2026-06-09
**Status:** Scope provided by owner; recorded for build
**Depends on:** M1–M5. Builds the finance order surface + COD mark-paid lifecycle.

---

## 1. Goal

Give Finance/Admin a way to see orders, filter them, view details, and mark
COD/manual orders as paid — which issues the ticket (QR), emails the attendee,
makes it downloadable in `/my-tickets`, syncs pretix, and is audited. All under
strict organizer/event isolation, blocked while impersonating.

## 2. Data model changes

`AttendeeOrder` gains (migration `add_attendee_order_payment`):
- `provider` enum `AttendeeOrderProvider { free manual_cod }` — set at registration.
- `totalCents Int @default(0)` — order total, set at registration.

These let the list filter by free vs COD and show amounts. Status stays
`pending | paid | canceled`.

## 3. Auth changes

- `SessionContext` gains `impersonating: boolean` (default `false`). No impersonation
  feature exists yet; the flag exists so the mark-paid guard is correct by construction.
- `getSessionContext` sets `impersonating: false`.
- New role check: finance actions allowed for `finance | organizer_admin | super_admin`.

## 4. Routes / UI

- `/admin/finance` — order list across the session's accessible orgs/events.
  - Filters: status (pending/paid/canceled) + method (free/COD). Tabs or selects.
  - Columns: event, order code, email, amount, method, status, action.
  - Row action "Mark paid" (only for COD pending; disabled while impersonating).
- `/admin/finance/[orderId]` — order detail: attendee, event, amount, status,
  timeline, mark-paid button.

Mutations via Server Actions. Finance link added to AdminShell sidebar (already present).

## 5. Finance service (`lib/finance/service.ts`)

- `listFinanceOrders(session, filters)` — AttendeeOrder joined to EventMapping,
  scoped via `scopeWhere`/org membership; `canAccessEvent` per row for staff. Filters
  by status + provider.
- `getFinanceOrder(session, orderId)` — scoped; null if cross-org.
- `markOrderPaid(session, orderId)`:
  1. **Reject if `session.impersonating`.**
  2. Require role finance|organizer_admin|super_admin; resolve order (scoped) or throw.
  3. If already paid → return (idempotent).
  4. pretix `markOrderPaid(org, eventSlug, orderCode, token)`.
  5. Update `AttendeeOrder.status = paid`.
  6. Send confirmation email (ticket URL via magic link). Best-effort.
  7. Audit `order.marked_paid`.
  Ticket QR/downloadability is already gated on `status === paid` in confirmation,
  `/t/[token]`, and `/my-tickets`, so marking paid enables them automatically.

## 6. Isolation

- Finance role is org-wide via existing `canAccessEvent` (finance = org-wide, staff =
  assigned events). `listFinanceOrders` constrains to the session's organizations.
- Super admin: all orgs (respects active-org selection for scoping where relevant).
- Cross-org access → not found / denied.

## 7. Testing (required)

- COD pending order: QR not shown (confirmation/`/t` show pending, no QR).
- `markOrderPaid` flips status → paid and ticket becomes available.
- Cross-org finance access denied (`getFinanceOrder` null; `markOrderPaid` throws).
- Impersonated session cannot mark paid (throws, no pretix/DB/email side effects).
- Free order issues instantly (registration already → paid; QR shown).
- Paid COD triggers confirmation email (dev-log transport asserts send called).

## 8. Docs / smoke

- Add `npm run smoke` script (fast core logic suite) — referenced in prior validation.
- Update README (finance section).
- OpenAPI: **deferred** — finance is Server Actions, no public HTTP API yet (external
  API is M10). Noted, not produced.

## 9. Out of scope

Refunds, partial payments, invoices/receipts PDF, real impersonation feature, Whish,
finance analytics/reporting beyond the list.

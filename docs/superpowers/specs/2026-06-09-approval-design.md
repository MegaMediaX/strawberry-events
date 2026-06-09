# Milestone 7 — Approval + Attendee Flow Design

**Date:** 2026-06-09
**Status:** Scope provided by owner; recorded for build
**Depends on:** M1–M6.

---

## 1. Goal

Event- and ticket-level approval so registrations can be auto-approved, manually
reviewed, rejected, or moved to payment-required, per event settings — without
conflicting with the existing payment/finance flow.

## 2. State modeling (key decision)

`AttendeeOrder.status` (pending|paid|canceled) is unchanged (payment lifecycle).
Add `approvalStatus AttendeeApprovalStatus { not_required | pending | approved | rejected }`.

The 9 owner-listed registration states are a **derived view** via
`registrationState(order)`:
| approvalStatus | status | → state |
|---|---|---|
| pending | * | `pending_approval` |
| rejected | * | `rejected` |
| not_required/approved | canceled | `canceled` |
| not_required/approved | pending | `pending_payment` |
| not_required/approved | paid | `issued` |

(`draft`/`submitted` are transient pre-persist; persisted rows start at
`pending_approval` or the no-approval path.)

**Ticket issuance** stays `status === "paid"` — we never mark an order paid until
approved (or approval not required), so the existing QR gating holds unchanged.

## 3. Approval configuration

- Event: existing `EventMapping.approvalMode` (none | manual | automatic | manual_and_automatic).
- Ticket-level: add `EventMapping.autoApproveItemIds Int[]` — pretix item ids that are
  always auto-approved even when the event requires approval (e.g. Visitor). Staff-only
  tickets remain admin-created (out of public flow).
- `payBeforeApproval Boolean @default(false)` on EventMapping — opt-in; default is
  approve-first-then-pay.
- Resolution `requiresApproval(event, itemIds)`:
  - `none` → false.
  - `manual` / `manual_and_automatic` → true unless every selected item ∈ autoApproveItemIds.
  - `automatic` → false (rules auto-approve; manual rules out of M7 scope, treated as auto).

## 4. Registration behavior (extends M5 service)

- No approval + free → issue instantly (paid). No approval + COD → pending_payment.
- Approval required → create pretix order pending (reserves capacity), `approvalStatus=pending`,
  `status=pending`, **no QR**, no ticket. Send `pending_approval` email. Show pending page.
- (pay-before-approval, if enabled: create pending_payment first; approval afterward —
  M7 supports the flag + state but default path is approve-first.)

## 5. Approval service (`lib/approval/service.ts`)

- `listApprovals(session, filters)` — AttendeeOrders with `approvalStatus=pending|approved|rejected`,
  org-scoped; filters by status, event, ticket/provider.
- `getApproval(session, orderId)` — scoped; includes submitted modular fields if present.
- `approve(session, orderId)`:
  1. Block if `session.impersonating`.
  2. Require role `super_admin | organizer_admin` (finance/staff cannot).
  3. Scoped resolve or throw.
  4. `approvalStatus=approved`. If free → pretix markPaid + `status=paid` (issued) + ticket email.
     If COD → leave `status=pending` (pending_payment) + approved/payment-required email.
  5. Audit `registration.approved`.
- `reject(session, orderId)`: same guards → `approvalStatus=rejected`, `status=canceled`,
  pretix cancel (best-effort), rejected email, audit `registration.rejected`.

## 6. Permissions

super_admin: all. organizer_admin: assigned org/events. finance: **cannot** approve/reject.
check-in staff: cannot. impersonating: cannot. Enforced in service + UI.

## 7. Attendee access (magic link / my-tickets / confirmation)

`registrationState` drives display:
- pending_approval → pending page (no QR).
- rejected → rejected message.
- pending_payment → payment instructions.
- issued → QR/ticket.
`/my-tickets` shows the derived state per order.

## 8. Email / dev-log templates

Add: `registration_submitted`, `pending_approval`, `approved`, `rejected`,
`payment_required` (approved COD), `ticket_issued`. Bilingual. Dev-log transport
logs them when SMTP absent.

## 9. Tests

auto-approval free → issued; manual approval → no QR; approve free → QR;
approve COD → pending_payment; rejected → never QR; finance cannot approve;
check-in staff cannot approve; cross-org approval denied; impersonated cannot
approve/reject; magic-link respects state; email/dev-log events fire.

## 10. Docs

README + spec: approval modes, state machine table, permissions, admin queue,
attendee-facing states.

## 11. Out of scope

Complex automatic rule conditions (treated as auto-approve), waitlist promotion,
refunds, real impersonation feature, finance-grant-approval permission toggle.

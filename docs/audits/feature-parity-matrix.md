# Feature Parity Matrix — MD Parity PR

Branch: `feature/md-parity-missing-features`. Restores feature parity with the original platform spec **except** payments/refunds and promo codes/vouchers, which are explicitly out of scope.

> Note: no `PLATFORM_DOCUMENTATION.md` exists in the repo. This matrix is built from the feature brief for this PR plus a survey of the current codebase (post 12-milestone build + audit remediation, board-review Run-1/2/3).

## Scope guardrails (carried from the brief + prior audit)
- pretix remains the source of truth for tickets/orders/check-in.
- No weakening of audit fixes (C1–C3, H1–H8) or org/event isolation.
- No hard DELETE; no QR before issued; no secret exposure; all admin/staff mutations audited.
- Payment direction unchanged: **COD/manual live, free tickets live, Whish placeholder only.**

## Explicitly EXCLUDED (will not be built in this PR)
| Area | Items |
|---|---|
| Payments/refunds | Stripe, PayPal, online card, refund/auto-refund, cancel-with-refund, gateway settlement |
| Promo/vouchers | promo code admin, discount codes, voucher redemption, pretix voucher frontend, usage limits, discount reports |

## Feature inventory

| # | Feature | Current state | Gap to close | Schema work |
|---|---------|---------------|--------------|-------------|
| 1 | **Staff walk-in registration** | `register()` service exists (public flow); staff area has `/staff` + `/staff/checkin` only | New `/staff/events` + `/staff/registrations`; staff-initiated walk-in reusing `register()` with role-gated server action (checkin_staff/org_admin/super; finance blocked; impersonation blocked; cross-org denied); badge print on issue | none (reuses AttendeeOrder + D5 phone/consent cols) |
| 2 | **Admin analytics dashboard** | `/admin` renders a minimal "Dashboard" | KPI aggregation service (counts: events/open/upcoming, registrations, issued, pending approval/payment, checked-in, waitlist, COD pending total, today); sections (upcoming, recent regs/checkins/audit, capacity); role-scoped (super=all, org=assigned, finance=finance-safe, checkin=assigned summary) | none (read aggregation) |
| 3 | **Admin registrations management** | `/admin/registrations` exists — basic org-scoped list (PR #18) | Filters (org/event/ticket/tag/approval/payment/issued/checkin/waitlist/date + search); detail panel (attendee, modular answers, order/approval/seat/waitlist/checkin/badge/audit); actions (view, manual create, CSV export, approve/reject, mark-COD-paid, resend email, QR-if-issued) — all reusing existing role boundaries; **no delete/refund/promo** | none |
| 4 | **User management UI** | No `/admin/users`; `User` has `emailVerified` only (no status) | `/admin/users` list/search/filter/detail; assign org/event access; role change (org_admin cannot create super_admin); suspend/unsuspend; audited; suspended users blocked at session | **migration**: `User.status` (active/suspended) enum + guard in session |
| 5 | **Email logs + resend** | `email/service.ts` (`emailMode`, `sendEmail`); no persistence | New `EmailLog` model + write on every send; `/admin/emails` list/filter/detail; resend (role-gated; checkin/impersonation blocked); never fake delivered/opened; prod dev-log fallback stays blocked (H7) | **migration**: `EmailLog` model |
| 6 | **Full Arabic UI pass** | next-intl wired (en/ar, RTL dir helper) but only ~10 message keys; most UI hardcoded English | Externalize strings → `messages/{en,ar}.json` across public + admin + staff; verify RTL on layout/forms/tables/badge; missing-key test for critical flows | none (i18n only) |
| 7 | **Modular form fields per ticket** | `CustomFormField` + `CustomFormAnswer` models exist; **zero app code** | Admin field-definition UI (per event/ticket); wizard renders fields for selected ticket; validate required; persist answers; surface in reg detail/approval/CSV/safe API DTO; bilingual labels | **migration**: add `placeholderEn/Ar` to `CustomFormField` (other fields already present) |
| 8 | **Maps / location** | No location fields on `EventMapping` | Admin venue/address/city/country/mapUrl/lat/lng/embed; public detail + confirmation show venue + directions + optional embed; safe when absent; no live Places API required | **migration**: location fields on `EventMapping` |
| 9 | **Calendar polish** | `lib/calendar/ics.ts` + `add-to-calendar.tsx` exist (ICS gen + component) | `.ics` download route; Google Calendar link; include location + URL + description; confirmation-page integration; private/hidden event safety | none |
| 10 | **Attendee portal** | `/login`, `/my-tickets`, `/t/[token]` (magic link) exist | `/register`, `/forgot-password`, `/reset-password`, `/my-registrations`, `/profile`; optional attendee accounts alongside guest magic links; own-data-only; QR only if issued; no OAuth; no cancel/refund | possibly password-reset token reuse of existing magic-link infra; verify |

## Cross-cutting constraints
- Every new mutation writes an `AuditLog` row.
- Every permission boundary gets a test (TDD on the boundary).
- All new strings are i18n-keyed (en + ar) so Feature 6 doesn't have to retrofit them.
- Migrations are additive only (no destructive changes); `liveOnPretix`/phone/consent precedents apply.

See `docs/roadmap/md-parity-implementation.md` for the chunked build plan, ordering, and test list.

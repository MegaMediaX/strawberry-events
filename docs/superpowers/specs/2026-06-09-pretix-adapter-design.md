# Milestone 2 — pretix Adapter (real implementations) Design

**Date:** 2026-06-09
**Status:** Approved (design); spec for review
**Depends on:** Milestone 1 (Foundation). Builds out `apps/web/src/lib/pretix/`.

---

## 1. Goal

Replace the `NotImplemented` stubs from M1 with real pretix REST integrations for the **read + core write path**, developed and integration-tested against a locally booted pretix container. This unblocks admin event/ticket management (M4) and COD registration (M5).

In scope: events (list/get/create/update), items/products (list/create), orders (create pending, get, mark-paid, cancel), check-in lists (read).

Out of scope (remain `NotImplemented`): vouchers, questions, webhook verification.

## 2. pretix provisioning (dev)

`scripts/pretix-bootstrap.sh` runs a Python snippet via `docker compose exec pretix pretix shell` to idempotently create:
- organizer `strawberry`,
- a team with "can change orders / events / API access",
- an API **token**, printed to stdout.

The operator pastes the token into `.env` as `PRETIX_API_TOKEN`. README documents the one-time step. Token lives in env for M2; per-organizer tokens on `Organization` are deferred to the isolation milestone. Organizer slug is always passed explicitly to adapter functions (never a global constant).

## 3. Components

All under `apps/web/src/lib/pretix/`:

- **`client.ts`** — existing `pretixFetch`; add `pretixFetchAll<T>(path)` that follows pretix pagination (`{count, next, results}`) and returns the concatenated `results`.
- **`mappers.ts`** (new) — `toI18n({en, ar})` ↔ `{titleEn, titleAr}`; `priceToCents(str)` / `centsToPrice(n)`. Pure, fully unit-tested.
- **`events.ts`** — `listEvents`, `getEvent`, `createEvent`, `updateEvent` against `/organizers/{org}/events/…`.
- **`products.ts`** — `listItems`, `createItem` against `/organizers/{org}/events/{ev}/items/`.
- **`orders.ts`** — `createOrder` (pending/unpaid, manual payment), `getOrder`, `markOrderPaid` (`…/orders/{code}/mark_paid/`), `cancelOrder` (`…/orders/{code}/cancel/`).
- **`checkin.ts`** — `listCheckinLists` (`…/checkinlists/`), read only.
- **`errors.ts`** — add `PretixValidationError extends PretixError` carrying parsed 400 field-error JSON.

### Endpoint reference (pretix REST `/api/v1`)
- Events: `GET|POST /organizers/{org}/events/`, `GET|PATCH /organizers/{org}/events/{event}/`
- Items: `GET|POST /organizers/{org}/events/{event}/items/`
- Orders: `GET|POST /organizers/{org}/events/{event}/orders/`, `POST …/orders/{code}/mark_paid/`, `POST …/orders/{code}/cancel/`
- Check-in lists: `GET /organizers/{org}/events/{event}/checkinlists/`

## 4. COD / manual order semantics

`createOrder` produces a pretix order in **pending/unpaid** state with no payment captured. `markOrderPaid` transitions it to paid; this is the hook finance/admin will call in a later milestone. M2 exposes correct adapter functions only — no finance UI, no email, no QR issuance logic here.

## 5. Error handling

- Non-2xx → `PretixError` (existing) with status + parsed detail.
- 400 specifically → `PretixValidationError` with `fieldErrors` so callers can surface per-field messages.
- Network/timeout → `PretixError` wrapping the cause.

## 6. Testing

Two layers:

1. **Unit tests (always run, offline)** — mock `globalThis.fetch`. For each function assert: request method, resolved URL, headers (token), and request body shape; and correct parsing/mapping of a representative response. `mappers.ts` gets direct pure tests. `pretixFetchAll` tested for multi-page concatenation.
2. **Live integration (`*.live.test.ts`, opt-in)** — run only when `PRETIX_BASE_URL` and `PRETIX_API_TOKEN` are set (otherwise `describe.skip`). Flow: create event → create item → create pending order → get order → mark paid → cancel a second order. Keeps `npm test` fast/offline; CI stays green without pretix.

## 7. Acceptance Criteria

1. `pretix-bootstrap.sh` yields a working organizer + token against the booted container.
2. Unit tests cover every implemented function (request + response) and `mappers`; `npm test` passes offline.
3. With env set, the live suite completes the full event→item→order→mark-paid flow green.
4. `pretixFetchAll` correctly follows pagination.
5. Vouchers/questions/webhooks still throw `NotImplemented`.
6. `npm run typecheck` and `npm run build` pass.

## 8. Out of Scope

Admin/registration UI, finance/email/QR, vouchers, questions, webhook verification, per-organizer token storage, seat/waitlist sync.

# Milestone 10 — External API / API Keys / Webhooks Design

**Date:** 2026-06-09
**Status:** Scope confirmed (per owner brief)
**Depends on:** M1–M9.

---

## 1. Goal

A secure, versioned external API (`/api/v1`) for organizers/integrations with hashed
API keys, scopes, per-key rate limits, org/event isolation, auditability, and signed
outbound webhooks — plus admin UI and OpenAPI docs.

## 2. Schema (mostly exists)

`ApiKey` (organizationId?, name, keyHash@unique, prefix, scopes[], eventRestrictions[],
rateLimitPerMin, createdByUserId, lastUsedAt, expiresAt, revokedAt) — reuse as-is;
`eventRestrictions[]` = event-scoped keys. `Webhook` (organizationId, url, secret,
events[], active) — **add** `eventId String?`, `createdByUserId String?`.
`WebhookDelivery` (webhookId, event, payload, responseCode, success, attempts, deliveredAt)
— **add** `error String?`, `nextRetryAt DateTime?`. Migration `add_webhook_meta`.

## 3. API keys (`lib/api/keys.ts`)

- Generate: `sk_strawberry_<random>`; store only SHA-256 hash + a display `prefix`
  (`sk_strawberry_abcd`). Raw key returned **once** at creation.
- `hashKey(raw)` (sha256 hex). `verify` = constant-time compare of hashes.
- Resolve: parse `Authorization: Bearer sk_...`, hash, look up by `keyHash`. Reject if
  missing/revoked (`revokedAt`)/expired (`expiresAt < now`). Update `lastUsedAt` (sampled).

## 4. Scopes

`events:read, attendees:read, attendees:write, orders:read, checkins:read,
checkins:write, waitlist:read, waitlist:write, seats:read, webhooks:manage`.
`requireScope(key, scope)` → 403 (`forbidden_scope`) if absent. Read-only keys lack
`:write` scopes.

## 5. Auth + isolation (`lib/api/auth.ts`)

`authenticateRequest(request, scope)`: resolve key → check scope → return
`{ key, organizationId, eventRestrictions }`. Every handler filters by the key's
`organizationId` (cross-org → 404/empty) and, for event-scoped keys, asserts the path
`:id` ∈ `eventRestrictions` (else `forbidden_event`). Never returns pretix tokens, secrets,
or raw magic links.

## 6. Rate limiting (`lib/api/rate-limit.ts`)

In-memory fixed-window per key (`rateLimitPerMin`, default 120). Over limit → `429`
(`rate_limited`) + `Retry-After` + `X-RateLimit-Limit/Remaining/Reset` headers. (Single-
instance; documented. Redis upgrade later.)

## 7. Response envelope (`lib/api/response.ts`)

Success `{ data, meta, error: null }`; error `{ data: null, meta: {}, error: { code, message } }`.
Lists include `meta.pagination { page, perPage, total }`. Helpers `ok(data, meta)`,
`fail(code, message, status)`.

## 8. Routes (`app/api/v1/...`)

GET `/events`, `/events/:id`, `/events/:id/attendees`, `/events/:id/orders`,
`/events/:id/checkins`, `/events/:id/waitlist`, `/events/:id/seats`, `/me`.
POST `/events/:id/waitlist`, `/events/:id/attendees`, `/events/:id/checkins`.
**DELETE** unsupported on every route → `405 method_not_allowed`. Each handler:
authenticate(scope) → isolation → query → envelope + pagination. Audit denials/usage.

## 9. Webhooks (`lib/webhooks/*`)

Events: `attendee.created, attendee.approved, attendee.rejected, order.created,
order.paid, ticket.issued, checkin.created, badge.printed, waitlist.joined,
waitlist.promoted, seat.held, seat.confirmed, seat.released`.
- `emit(orgId, eventName, payload, eventId?)`: find active subscribed webhooks (org +
  optional eventId), create `WebhookDelivery`, attempt delivery **without blocking** the
  caller (fire-and-forget, errors swallowed + recorded).
- `deliver(delivery)`: POST signed body. Headers: `X-Strawberry-Signature` (HMAC-SHA256
  hex of `${timestamp}.${body}`), `X-Strawberry-Timestamp`, `X-Strawberry-Delivery`,
  `X-Strawberry-Event`. On failure record `error`/`responseCode`, set `nextRetryAt`
  (backoff); a simple retry pass re-sends due deliveries.
- Wire `emit` into existing services: approve/reject, register (order.created/paid,
  ticket.issued), check-in, waitlist join/promote, seat confirm/release. Best-effort.

## 10. Admin UI

`/admin/settings/api-keys`: list (prefix, scopes, lastUsed, createdBy, expiry, revoked),
create (returns raw key once + copy), revoke. `/admin/settings/webhooks`: list, create
(url + events), enable/disable, rotate secret, test delivery, recent deliveries.

## 11. Permissions

Manage keys/webhooks: super_admin (all), organizer_admin (their org/events). Finance &
check-in staff cannot. Impersonating cannot create/revoke keys or webhook endpoints.
Cross-org denied. Guarded via `assertCanManageIntegrations(session)`.

## 12. Audit

`apikey.created/revoked/denied`, `apikey.rate_limited`, `scope.denied`,
`webhook.created/enabled/disabled/secret_rotated`, `webhook.delivery` (success/failure).

## 13. OpenAPI

`docs/api/openapi.yaml` (3.1): auth (Bearer), scopes, error shape, endpoints with
examples, webhook payload + signature docs. Linked from README.

## 14. Tests

Key: create shows raw once; stored hashed; revoked fails; expired fails; read-only cannot
write; event-scoped cannot access another event; org-scoped cannot access another org;
missing scope 403; rate limit 429; finance/check-in cannot create; impersonated cannot
create/revoke. Webhook: payload signed correctly; delivery failure doesn't break action;
events fire for order.paid/ticket.issued/checkin/waitlist.promoted/seat.confirmed. API:
DELETE 405; pagination; envelope.

## 15. Docs

README: API auth, key creation, scopes, rate limits, webhook setup + signature
verification + example payloads + security limitations (in-memory rate limit single-instance).

## 16. Out of scope

OAuth, per-endpoint Redis rate limiting, webhook delivery dashboards beyond recent list,
GraphQL, destructive DELETE endpoints.

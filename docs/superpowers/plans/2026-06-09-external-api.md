# External API / Keys / Webhooks (Milestone 10) Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Versioned `/api/v1` with hashed scoped API keys, rate limits, org/event isolation, signed outbound webhooks, admin UI, and OpenAPI docs.

Spec: `docs/superpowers/specs/2026-06-09-external-api-design.md`

---

## Chunk 1: schema + key lib + scopes (TDD)

### Task 1: schema
- [ ] Webhook `eventId String?`, `createdByUserId String?`; WebhookDelivery `error String?`, `nextRetryAt DateTime?`. Migration `add_webhook_meta` (dev :5433); regen client. Commit.

### Task 2: key generation/hashing + scopes (TDD)
- [ ] `lib/api/keys.ts`: `generateKey()` → `{ raw, hash, prefix }` (`sk_strawberry_…`), `hashKey(raw)` (sha256), `isExpired`, `isRevoked`. `lib/api/scopes.ts`: SCOPES const + `hasScope`. Tests. Commit.

---

## Chunk 2: auth + rate limit + envelope (TDD)

### Task 3: response envelope + rate limiter
- [ ] `lib/api/response.ts` (`ok`/`fail`, pagination meta). `lib/api/rate-limit.ts` (in-memory fixed window, `check(keyId, limit)`). Tests. Commit.

### Task 4: authenticateRequest
- [ ] `lib/api/auth.ts`: parse Bearer, resolve key (mock prisma), reject missing/revoked/expired, scope check, event/org context, rate limit. Tests (revoked/expired/missing-scope/rate-limit/event-scope). Commit.

---

## Chunk 3: API routes

### Task 5: read routes + /me + DELETE block
- [ ] `app/api/v1/me`, `/events`, `/events/[id]`, `/events/[id]/attendees|orders|checkins|waitlist|seats` (GET): authenticate(scope) + isolation + pagination + envelope. Shared `withApi(scope, handler)` wrapper that also returns 405 for DELETE/unsupported. `npm run build`. Commit.

### Task 6: write routes
- [ ] POST `/events/[id]/waitlist` (waitlist:write), `/events/[id]/attendees` (attendees:write), `/events/[id]/checkins` (checkins:write). Read-only key → 403. Build. Commit.

---

## Chunk 4: webhooks emit + delivery

### Task 7: emit + sign + deliver (TDD)
- [ ] `lib/webhooks/events.ts` (event-name consts), `lib/webhooks/service.ts`: `emit(orgId,event,payload,eventId?)` (non-blocking), `signPayload(secret,ts,body)`, `deliver(delivery)`, `retryDue()`. Tests (signature correct; failure recorded, doesn't throw). Commit.

### Task 8: wire emit into services
- [ ] Emit from approve/reject (attendee.approved/rejected, ticket.issued), register (order.created/paid, ticket.issued, waitlist not here), check-in (checkin.created, badge.printed), waitlist (waitlist.joined/promoted), seats (seat.confirmed/released). Best-effort. Tests assert emit called. Commit.

---

## Chunk 5: admin UI

### Task 9: API keys UI
- [ ] `lib/api/admin-service.ts` (createKey/listKeys/revokeKey, guarded: organizer/super, impersonation blocked, cross-org denied, audited). `/admin/settings/api-keys` page + actions (create returns raw once + copy, revoke). Tests for service guards. Build. Commit.

### Task 10: webhooks UI
- [ ] `lib/webhooks/admin-service.ts` (create/list/setEnabled/rotateSecret/test, guarded + audited). `/admin/settings/webhooks` page + actions. Build. Commit.

---

## Chunk 6: OpenAPI + verify + docs

### Task 11: OpenAPI + tests + verify + docs
- [ ] `docs/api/openapi.yaml` (auth/scopes/errors/endpoints/webhook payloads + examples). Integration test (real DB): key create→hashed, revoked/expired fail, scope/isolation, DELETE 405, rate limit 429, webhook signed + delivery-failure-safe. lint+typecheck+test+smoke+build green. README API+webhook section. Commit.

---

## Notes
- DRY: `withApi` wrapper centralizes auth/scope/isolation/envelope/405. YAGNI: no OAuth, no Redis limiter, no delivery dashboard.
- TDD on keys, scopes, auth, rate-limit, webhooks, admin services. Routes/UI by build + integration.
- Security: only hashed keys stored; raw shown once; never leak pretix tokens/secrets/magic links; cross-org/event isolation enforced in every handler.

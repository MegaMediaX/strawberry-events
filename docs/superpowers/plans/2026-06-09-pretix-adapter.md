# pretix Adapter (Milestone 2) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the pretix adapter's `NotImplemented` stubs with real REST integrations for the read + core write path (events, items, orders, check-in lists), unit-tested offline and integration-tested against a booted pretix.

**Architecture:** All pretix HTTP goes through `pretixFetch`/`pretixFetchAll` in `client.ts`. Pure mappers convert pretix i18n dicts and money strings. Resource modules (events/products/orders/checkin) compose these. Unit tests mock `fetch`; an opt-in `*.live.test.ts` suite runs only when pretix env is present.

**Tech Stack:** TypeScript, Vitest, pretix REST API v1, Docker Compose.

Spec: `docs/superpowers/specs/2026-06-09-pretix-adapter-design.md`

---

## File Structure

```
apps/web/src/lib/pretix/
  client.ts          # + pretixFetchAll (pagination)
  errors.ts          # + PretixValidationError
  mappers.ts         # NEW: i18n + money mappers (pure)
  events.ts          # real impls
  products.ts        # real impls
  orders.ts          # real impls
  checkin.ts         # listCheckinLists real; rest stays NotImplemented
  vouchers.ts        # unchanged (NotImplemented)
  questions.ts       # unchanged (NotImplemented)
  webhooks.ts        # unchanged (NotImplemented)
  __tests__/
    mappers.test.ts          # NEW
    client.test.ts           # + pagination cases
    events.test.ts           # NEW
    products.test.ts         # NEW
    orders.test.ts           # NEW
    checkin.test.ts          # NEW
    adapter.live.test.ts     # NEW, opt-in (env-gated)
scripts/pretix-bootstrap.sh  # NEW
```

A shared test helper `__tests__/helpers.ts` provides `mockJson(status, body)` and a fetch-spy installer to keep request-assertion tests DRY.

---

## Chunk 1: Pure mappers & errors

### Task 1: Money + i18n mappers
**Files:** Create `src/lib/pretix/mappers.ts`, `src/lib/pretix/__tests__/mappers.test.ts`.
- [ ] Step 1: Write failing tests:
```ts
import { toI18n, fromI18n, priceToCents, centsToPrice } from "@/lib/pretix/mappers";
test("fromI18n picks en/ar", () => {
  expect(fromI18n({ en: "Hi", ar: "مرحبا" })).toEqual({ titleEn: "Hi", titleAr: "مرحبا" });
});
test("toI18n drops empty ar", () => {
  expect(toI18n("Hi", null)).toEqual({ en: "Hi" });
  expect(toI18n("Hi", "مرحبا")).toEqual({ en: "Hi", ar: "مرحبا" });
});
test("price <-> cents", () => {
  expect(priceToCents("10.50")).toBe(1050);
  expect(centsToPrice(1050)).toBe("10.50");
  expect(priceToCents("0.00")).toBe(0);
});
```
- [ ] Step 2: Run `npx vitest run mappers` → FAIL.
- [ ] Step 3: Implement `mappers.ts` (pure functions; `centsToPrice` always 2 decimals).
- [ ] Step 4: `npx vitest run mappers` → PASS.
- [ ] Step 5: Commit `feat(pretix): i18n + money mappers`.

### Task 2: PretixValidationError
**Files:** Modify `src/lib/pretix/errors.ts`; Test `src/lib/pretix/__tests__/errors.test.ts` (new).
- [ ] Step 1: Write failing test: constructing `new PretixValidationError("bad", {email:["required"]})` exposes `.status===400`, `.fieldErrors.email`.
- [ ] Step 2: Run → FAIL.
- [ ] Step 3: Add `PretixValidationError extends PretixError` with `fieldErrors: Record<string,string[]>`, status fixed to 400.
- [ ] Step 4: Run → PASS.
- [ ] Step 5: Commit `feat(pretix): PretixValidationError`.

---

## Chunk 2: client pagination + error mapping

### Task 3: pretixFetchAll
**Files:** Modify `src/lib/pretix/client.ts`; modify `__tests__/client.test.ts`.
- [ ] Step 1: Write failing tests: `pretixFetchAll("/x/")` follows `next` once and concatenates `results` from two pages; sends token on both requests. Also: a 400 response from `pretixFetch` throws `PretixValidationError` with parsed `fieldErrors`.
- [ ] Step 2: Run `npx vitest run client` → FAIL.
- [ ] Step 3: Implement `pretixFetchAll<T>(path): Promise<T[]>` looping on `next` (absolute URLs returned by pretix; call them directly with auth header). Update error branch: if status===400 and body is an object, throw `PretixValidationError`.
- [ ] Step 4: Run → PASS.
- [ ] Step 5: Commit `feat(pretix): paginated fetch + 400 validation mapping`.

### Task 4: shared test helper
**Files:** Create `src/lib/pretix/__tests__/helpers.ts`.
- [ ] Step 1: Implement `installFetchMock()` returning a spy + `queue(...responses)`; `jsonResponse(body, status)`.
- [ ] Step 2: Refactor `client.test.ts` to use it (no behavior change); run `npx vitest run client` → PASS.
- [ ] Step 3: Commit `test(pretix): shared fetch mock helper`.

---

## Chunk 3: events + products

### Task 5: events.ts
**Files:** Rewrite `src/lib/pretix/events.ts`; Test `__tests__/events.test.ts`.
- [ ] Step 1: Write failing tests using helper:
  - `listEvents("org")` → GET `…/api/v1/organizers/org/events/`, returns mapped events (uses `pretixFetchAll`).
  - `getEvent("org","ev")` → GET `…/events/ev/`.
  - `createEvent("org",{titleEn,titleAr,slug,...})` → POST with body `{name:{en,ar}, slug, ...}` (uses `toI18n`).
  - `updateEvent("org","ev",patch)` → PATCH.
- [ ] Step 2: Run `npx vitest run events` → FAIL.
- [ ] Step 3: Implement against endpoints in spec §3; map names via `mappers`.
- [ ] Step 4: Run → PASS.
- [ ] Step 5: Commit `feat(pretix): real events adapter`.

### Task 6: products.ts
**Files:** Rewrite `src/lib/pretix/products.ts`; Test `__tests__/products.test.ts`.
- [ ] Step 1: Write failing tests: `listItems("org","ev")` GET `…/events/ev/items/` (paginated); `createItem(...)` POST with `name:{en,ar}`, `default_price` from cents via `centsToPrice`.
- [ ] Step 2: Run → FAIL.
- [ ] Step 3: Implement.
- [ ] Step 4: Run → PASS.
- [ ] Step 5: Commit `feat(pretix): real products adapter`.

---

## Chunk 4: orders + checkin

### Task 7: orders.ts
**Files:** Rewrite `src/lib/pretix/orders.ts`; Test `__tests__/orders.test.ts`.
- [ ] Step 1: Write failing tests:
  - `createOrder("org","ev", payload)` → POST `…/events/ev/orders/`; assert body marks order pending/unpaid (no payment captured) and returns parsed `{code,status}`.
  - `getOrder` → GET `…/orders/{code}/`.
  - `markOrderPaid` → POST `…/orders/{code}/mark_paid/`.
  - `cancelOrder` → POST `…/orders/{code}/cancel/`.
- [ ] Step 2: Run `npx vitest run orders` → FAIL.
- [ ] Step 3: Implement. Keep `createOrder` payload typed (caller supplies positions/email); document COD = pending in a comment.
- [ ] Step 4: Run → PASS.
- [ ] Step 5: Commit `feat(pretix): real orders adapter (COD pending + mark-paid)`.

### Task 8: checkin.ts
**Files:** Modify `src/lib/pretix/checkin.ts`; Test `__tests__/checkin.test.ts`.
- [ ] Step 1: Write failing test: `listCheckinLists("org","ev")` → GET `…/events/ev/checkinlists/` (paginated). `performCheckin` still throws `NotImplemented`.
- [ ] Step 2: Run → FAIL.
- [ ] Step 3: Implement `listCheckinLists`; leave `performCheckin` as `NotImplemented`.
- [ ] Step 4: Run → PASS.
- [ ] Step 5: Commit `feat(pretix): checkin lists read`.

---

## Chunk 5: provisioning + live test + verify

### Task 9: pretix bootstrap script
**Files:** Create `scripts/pretix-bootstrap.sh`; update `README.md`.
- [ ] Step 1: Write a bash script invoking `docker compose exec -T pretix pretix shell -c "<python>"` that idempotently creates organizer `strawberry`, a team with API access + all-events, and an API token; prints the token.
- [ ] Step 2: Document the one-time step + pasting `PRETIX_API_TOKEN` into `.env` in README.
- [ ] Step 3: Commit `feat: pretix dev bootstrap script`.

### Task 10: live integration suite (opt-in)
**Files:** Create `src/lib/pretix/__tests__/adapter.live.test.ts`.
- [ ] Step 1: `describe.skipIf(!process.env.PRETIX_BASE_URL || !process.env.PRETIX_API_TOKEN)`. Flow: createEvent → createItem → createOrder(pending) → getOrder → markOrderPaid → createOrder #2 → cancelOrder. Use a unique slug per run; best-effort cleanup.
- [ ] Step 2: Confirm it is SKIPPED under plain `npx vitest run` (no env). Commit `test(pretix): opt-in live integration suite`.

### Task 11: Live verification against booted pretix
- [ ] Step 1: `docker compose up -d postgres-pretix redis pretix`; wait healthy.
- [ ] Step 2: `bash scripts/pretix-bootstrap.sh` → capture token; export `PRETIX_BASE_URL`/`PRETIX_API_TOKEN`.
- [ ] Step 3: Run `npx vitest run adapter.live` → PASS (full flow green).
- [ ] Step 4: Run full `npx vitest run` (offline subset) + `npm run typecheck` + `npm run build` → all green.
- [ ] Step 5: Commit `chore(pretix): M2 verified against live pretix` and update README notes.

---

## Notes
- DRY via `mappers.ts` + `__tests__/helpers.ts`. YAGNI: vouchers/questions/webhooks stay `NotImplemented`.
- TDD on every function (request shape + response parsing). Live suite is the integration gate, not a replacement for unit tests.
- Frequent commits per task. Reference: @superpowers:test-driven-development, @superpowers:verification-before-completion.

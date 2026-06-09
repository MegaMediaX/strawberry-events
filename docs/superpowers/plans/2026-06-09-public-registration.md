# Public Registration (Milestone 5) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Premium public event listing, detail, and a 3-step registration wizard that creates real pretix orders (free → instant QR; COD → pending), with guest magic-link + account ticket access, light/dark theming, and SMTP-or-dev-log email.

**Architecture:** Public read paths (not org-scoped) in `lib/events/public.ts` enrich `EventMapping` with pretix availability. A payment-provider abstraction selects COD vs free. `lib/registration/service.ts` creates the pretix order, writes a local `AttendeeOrder`, and triggers email. UI is Server Components + Server Actions, themed via CSS variables, with framer-motion only on the wizard.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind v4 (CSS-var theming), framer-motion, nodemailer, qrcode, Prisma, Vitest.

Spec: `docs/superpowers/specs/2026-06-09-public-registration-design.md`

---

## File Structure

```
apps/web/src/
  styles/themes.css                  # token vars :root + [data-theme=dark]
  lib/
    theme/theme.ts                    # theme type + resolve helper (tested)
    events/public.ts                  # listPublicEvents/getPublicEvent (tested)
    events/capacity.ts                # capacityState() (tested)
    payments/provider.ts              # PaymentProvider interface + registry
    payments/manual-cod.ts            # COD provider
    payments/whish.ts                 # disabled placeholder
    registration/schema.ts            # zod register input
    registration/service.ts           # register() (tested)
    email/service.ts                  # send() + transport selection (tested)
    email/templates.ts                # pending / confirmation (bilingual)
    tokens/magic-link.ts              # sign/verify (tested)
    calendar/ics.ts                   # ics + google link (tested)
  components/public/
    public-nav.tsx theme-toggle.tsx
    event-card.tsx availability-bar.tsx
    event-hero.tsx ticket-rail.tsx mobile-cta-bar.tsx
    qr-code-display.tsx add-to-calendar.tsx
  components/registration/
    registration-wizard.tsx stepper.tsx
    attendee-step.tsx ticket-step.tsx consent-step.tsx phone-country-field.tsx
  app/[locale]/(public)/
    layout.tsx                        # PublicNav + theme provider
    events/page.tsx events/[slug]/page.tsx
    events/[slug]/register/page.tsx + actions.ts
    events/[slug]/confirmation/[orderCode]/page.tsx
    events/[slug]/payment-pending/[orderCode]/page.tsx
    t/[token]/page.tsx
    my-tickets/page.tsx
  prisma/schema.prisma                # AttendeeOrder
```

---

## Chunk 1: Theme system + public shell

### Task 1: theme resolve helper (TDD)
**Files:** Create `src/lib/theme/theme.ts`, `__tests__/theme.test.ts`.
- [ ] Write failing test: `resolveTheme("dark")==="dark"`, `resolveTheme("light")==="light"`, `resolveTheme("system", prefersDark=true)==="dark"`, default light.
- [ ] Run `npx vitest run theme` → FAIL.
- [ ] Implement `type Theme = "light"|"dark"|"system"` + `resolveTheme`.
- [ ] Run → PASS. Commit `feat(theme): resolve helper`.

### Task 2: design tokens CSS
**Files:** Create `src/styles/themes.css`; import in `globals.css`.
- [ ] Add `:root` (editorial/light) + `[data-theme="dark"]` (immersive) custom properties per spec §3 (bg, surface, border, fg, fg-muted, primary, accent, success/amber/danger, gradients, radii). Map a few to Tailwind theme via `@theme inline` where helpful.
- [ ] `npm run build` → PASS. Commit `feat(theme): light/dark design tokens`.

### Task 3: fonts (Inter + IBM Plex Sans Arabic)
**Files:** Modify `app/[locale]/layout.tsx`.
- [ ] Load both via `next/font/google`; apply IBM Plex Sans Arabic when `dir=rtl`. Set Arabic line-heights via a `[dir="rtl"]` rule in themes.css.
- [ ] `npm run build` → PASS. Commit `feat(theme): Inter + IBM Plex Sans Arabic`.

### Task 4: PublicNav + ThemeToggle + public layout
**Files:** Create `components/public/public-nav.tsx`, `theme-toggle.tsx`, `app/[locale]/(public)/layout.tsx`.
- [ ] ThemeToggle (client): sets `data-theme` on `<html>`, persists to localStorage, lazy-init (no setState-in-effect). PublicNav: brand, language switcher, theme toggle.
- [ ] Public layout wraps children with PublicNav. Move existing `(public)/page.tsx` sample under the new layout (keep building).
- [ ] `npm run build` → PASS. Commit `feat(public): nav + theme toggle + layout`.

---

## Chunk 2: public data + capacity

### Task 5: capacity state helper (TDD)
**Files:** Create `src/lib/events/capacity.ts`, test.
- [ ] Failing test: `capacityState(sold,total)` → available <60%, filling 60–84, almost_full 85–99, sold_out 100; total 0/null → available.
- [ ] Run → FAIL. Implement. Run → PASS. Commit `feat(events): capacity state helper`.

### Task 6: public event reads (TDD)
**Files:** Create `src/lib/events/public.ts`, `__tests__/public.test.ts`.
- [ ] Failing tests (mock prisma + pretix products/events): `listPublicEvents()` returns only `visibility=public` events, splits `comingSoon`; `getPublicEvent(slug)` returns mapping + items (price/quota) or null when not public.
- [ ] Run → FAIL. Implement using `EventMapping` query (visibility filter) + `resolvePretixContext` + `pretixProducts.listItems`. Run → PASS. Commit `feat(events): public read paths`.

---

## Chunk 3: listing page

### Task 7: AvailabilityBar + EventCard
**Files:** Create `components/public/availability-bar.tsx`, `event-card.tsx`.
- [ ] AvailabilityBar: themed track + fill colored by `capacityState`, fill-on-mount transition, `prefers-reduced-motion` guard. EventCard: banner gradient, title (bilingual), date/location, status chip, capacity bar.
- [ ] `npm run build` → PASS. Commit `feat(public): event card + availability bar`.

### Task 8: listing page
**Files:** Create `app/[locale]/(public)/events/page.tsx`.
- [ ] Server component: `listPublicEvents()`, render open grid + coming-soon section. Empty states.
- [ ] `npm run build` → PASS. Commit `feat(public): event listing page`.

---

## Chunk 4: event detail

### Task 9: .ics + calendar (TDD)
**Files:** Create `src/lib/calendar/ics.ts`, test.
- [ ] Failing test: `buildIcs({title,start,end,location,description})` contains `BEGIN:VCALENDAR`, `SUMMARY:`, UTC `DTSTART`; `googleCalUrl(...)` has encoded dates/title.
- [ ] Run → FAIL. Implement. Run → PASS. Commit `feat(calendar): ics + google link`.

### Task 10: EventHero + TicketRail + MobileCTABar + AddToCalendar
**Files:** Create those components.
- [ ] EventHero (title display scale, date/location, status+capacity chip, theme-responsive overlay). TicketRail (sticky desktop, price/capacity/Register/calendar). MobileCTABar (fixed bottom, slide-up). AddToCalendar (.ics download + Google link).
- [ ] `npm run build` → PASS. Commit `feat(public): hero + ticket rail + mobile CTA`.

### Task 11: detail page
**Files:** Create `app/[locale]/(public)/events/[slug]/page.tsx`.
- [ ] `getPublicEvent(slug)` (404 if not public); render hero → tickets → about → countdown(inline) → speakers/agenda/partners (render only if content) → location. Register CTA links to wizard.
- [ ] `npm run build` → PASS. Commit `feat(public): event detail page`.

---

## Chunk 5: payments + registration core

### Task 12: AttendeeOrder model + migration
**Files:** Modify `prisma/schema.prisma`.
- [ ] Add `AttendeeOrder` (id, eventMappingId fk, orderCode, email, userId nullable fk, status enum, magicLinkToken unique, timestamps). `prisma validate`; generate migration `add_attendee_order` (throwaway PG). Commit `feat(db): AttendeeOrder model`.

### Task 13: magic-link tokens (TDD)
**Files:** Create `src/lib/tokens/magic-link.ts`, test.
- [ ] Failing test: `verifyMagicLink(signMagicLink(orderCode))===orderCode`; tampered → null. HMAC with `WEBHOOK_SECRET`/dedicated secret.
- [ ] Run → FAIL. Implement. Run → PASS. Commit `feat(tokens): magic-link sign/verify`.

### Task 14: payment provider abstraction
**Files:** Create `payments/provider.ts`, `manual-cod.ts`, `whish.ts`, test.
- [ ] Failing test: registry returns `manual_cod` enabled and `whish` disabled; `selectProvider(totalCents)` → "free" when 0 else "manual_cod".
- [ ] Run → FAIL. Implement interface + registry + selection. Run → PASS. Commit `feat(payments): provider abstraction + COD`.

### Task 15: email service (TDD)
**Files:** Create `email/service.ts`, `templates.ts`, test.
- [ ] Failing test: with no SMTP env, `getTransport()` is the dev/log transport; `send()` returns ok and does not throw; templates render bilingual subject/body.
- [ ] Run → FAIL. Implement nodemailer (SMTP if env else `jsonTransport`/log). Run → PASS. Commit `feat(email): service + dev log transport`.

### Task 16: registration service (TDD)
**Files:** Create `registration/schema.ts`, `registration/service.ts`, `__tests__/service.test.ts`.
- [ ] Failing tests (mock prisma + pretix orders + email): free event → pretix order created (paid path) + AttendeeOrder status paid + confirmation email; COD → pending order + AttendeeOrder pending + pending email; email throw is swallowed (order still returned); consent false → zod reject.
- [ ] Run → FAIL. Implement `register(input)` per spec §6. Run → PASS. Commit `feat(registration): order creation service`.

---

## Chunk 6: registration wizard UI

### Task 17: PhoneCountryField + steps
**Files:** Create `components/registration/phone-country-field.tsx`, `attendee-step.tsx`, `ticket-step.tsx`, `consent-step.tsx`, `stepper.tsx`.
- [ ] PhoneCountryField (code adornment + number). Steps as controlled sections (rhf). Stepper (desktop nodes / mobile segmented). Ticket cards with quantity steppers + select scale.
- [ ] `npm run build` → PASS. Commit `feat(registration): wizard steps + phone field`.

### Task 18: RegistrationWizard + action
**Files:** Create `components/registration/registration-wizard.tsx`, `app/[locale]/(public)/events/[slug]/register/page.tsx`, `register/actions.ts`.
- [ ] Wizard orchestrates 3 steps with framer-motion slide (24px, reduced-motion guard). `registerAction` calls `registration.service.register`, maps field errors, redirects to confirmation (free/paid) or payment-pending (COD).
- [ ] `npm run build` → PASS. Commit `feat(registration): wizard + server action`.

---

## Chunk 7: confirmation, access, dashboard, verify

### Task 19: QRCodeDisplay + ConfirmationTicket
**Files:** Create `components/public/qr-code-display.tsx`, `confirmation/[orderCode]/page.tsx`, `payment-pending/[orderCode]/page.tsx`.
- [ ] `npm i qrcode`; QRCodeDisplay renders secret to QR. Confirmation shows ticket+QR+calendar (free/paid). Payment-pending shows status, no QR.
- [ ] `npm run build` → PASS. Commit `feat(public): confirmation + payment-pending + QR`.

### Task 20: guest magic-link + my-tickets
**Files:** Create `app/[locale]/(public)/t/[token]/page.tsx`, `my-tickets/page.tsx`.
- [ ] `/t/[token]` verifies token → loads AttendeeOrder → ticket (if issued) else pending; invalid → generic page. `/my-tickets` lists AttendeeOrder by session user id (active + past).
- [ ] `npm run build` → PASS. Commit `feat(public): guest ticket access + attendee dashboard`.

### Task 21: integration + live e2e + full verify
**Files:** Create `registration/__tests__/register.integration.test.ts` (gated `TEST_DATABASE_URL`), `register.e2e.test.ts` (gated `E2E_LIVE`).
- [ ] Integration (real DB, mocked pretix): register writes AttendeeOrder (free→paid, COD→pending). Skips offline.
- [ ] Live e2e (real pretix): register a COD order → pretix order pending; free → paid. Skips offline.
- [ ] Run gated suites against throwaway PG + booted pretix → green.
- [ ] Full: `npx vitest run` (offline) + `npm run lint` + `npm run typecheck` + `npm run build` green. Update README. Commit `chore(public): M5 verified`.

---

## Notes
- DRY: public reads centralized in `events/public.ts`; payment selection centralized.
- YAGNI: no seats/sessions/waitlist/approval/finance-UI/Whish.
- TDD on logic units (theme, capacity, public reads, ics, magic-link, payments, email, registration). UI by build + walkthrough.
- Reference: @superpowers:test-driven-development, @superpowers:verification-before-completion.

# Milestone 5 — Public Registration Design

**Date:** 2026-06-09
**Status:** Approved (design); spec for review
**Depends on:** M1 (Foundation), M2 (pretix adapter), M4 (admin events/tickets).

---

## 1. Goal

The premium, mobile-first public attendee experience (priority A): event listing,
event detail, and a registration wizard that creates real pretix orders. Guest and
account checkout; free events issue tickets instantly, COD events create a pending
order until finance marks paid (that admin UI is a later milestone).

In scope: public listing (open + coming-soon), event detail, 3-step registration
wizard, COD + free checkout, confirmation/payment-pending pages, guest magic-link
ticket access, basic account dashboard (`/my-tickets`), light/dark theme system,
email via SMTP-or-dev-log.

Out of scope (later milestones): seat selection, sessions/workshops, waitlist,
manual-approval attendee flow, finance mark-paid UI, real Whish.

## 2. Routes (`src/app/[locale]/(public)/`)

- `/events` — listing: published public events, open vs coming-soon split.
- `/events/[slug]` — detail.
- `/events/[slug]/register` — full-page wizard.
- `/events/[slug]/confirmation/[orderCode]` — free/paid success + QR.
- `/events/[slug]/payment-pending/[orderCode]` — COD pending state (no QR).
- `/t/[token]` — guest magic-link ticket access.
- `/my-tickets` — account attendee dashboard.

## 3. Visual system (from design direction)

Theme-driven: **light = editorial** (airy, white, soft realistic shadows),
**dark = immersive** (dark canvas, rose→violet gradients, glass/glow). Implemented
as CSS custom properties on `:root` / `[data-theme="dark"]`; components read tokens.

- Palette (light/dark), radius (`6/12/20/28/full`), 4px spacing rhythm.
- Fonts: **Inter** (Latin) + **IBM Plex Sans Arabic** (Arabic). Arabic line-heights
  1.4 headings / 1.8 body; no tracking on Arabic.
- Capacity bar states: <60% green, 60–84% amber, 85–99% red+pulse, 100% sold-out→waitlist CTA.
- Theme provider (persisted, system default) + `ThemeToggle` in `PublicNav`.

## 4. Public data access (NOT org-scoped)

`lib/events/public.ts`:
- `listPublicEvents()` → events where `visibility = public` AND not draft, split into
  open vs `comingSoon`. Reads `EventMapping`; enriches with pretix availability.
- `getPublicEvent(slug)` → mapping + pretix items (price, quota availability) via the
  adapter using the event's resolved org pretix context. No session.

Public listing intentionally crosses orgs (it's the Strawberry-branded storefront);
this is the one read path that is not org-scoped, and it only ever exposes published
public data.

## 5. Payment provider abstraction (spec §F)

`lib/payments/`:
```ts
interface PaymentProvider {
  id: string; label: string; enabled: boolean;
  createPayment(order): Promise<PaymentIntent>;
  // verifyWebhook/markPaid/cancelPayment for future providers
}
```
- `manual_cod` implemented; `whish` present but `enabled: false` (placeholder).
- COD availability decided per event (event setting; default on for M5).

## 6. Registration flow

`lib/registration/service.ts` `register(input)`:
1. Validate with zod (attendee fields, selected tickets, consent booleans true).
2. Resolve event → pretix context.
3. Compute total. **Free (total 0):** create pretix order marked paid → QR issued.
   **COD:** create pending/unpaid pretix order → QR withheld.
4. Write local `AttendeeOrder` (orderCode, email, eventMappingId, userId nullable,
   status, magicLinkToken).
5. Send email (confirmation+QR for free; pending for COD) via email service.
6. Return `{ orderCode, status }` → redirect to confirmation or payment-pending.

Required attendee fields: first/last name, email, phone (+ country code), company.
Consent: Terms + Privacy (both required). Phone uses a country-code adornment.

## 7. Data model (new)

`AttendeeOrder`:
```
id, eventMappingId (fk), orderCode, email, userId (nullable fk),
status (pending|paid|canceled), magicLinkToken (unique), createdAt, updatedAt
```
New Prisma migration. `magicLinkToken` is a signed, unguessable token.

## 8. Ticket access + email

- `lib/email/`: nodemailer transport from admin/env SMTP if configured, else a dev
  transport that logs the message + any magic link to the server console. Templates:
  `registration-pending`, `confirmation-ticket` (bilingual subject/body).
- Guest: `/t/[token]` verifies the signed token → shows ticket/QR if order paid/issued.
  Order-code + email fallback form.
- Account: `/my-tickets` lists `AttendeeOrder` by `userId` (active + history).
- QR: `QRCodeDisplay` renders the pretix order/position secret.

## 9. Components

`PublicNav` (lang + theme toggle), `EventList`/`EventCard`/`AvailabilityBar`,
`EventHero`, detail sections, `TicketRail` + `MobileCTABar`, `RegistrationWizard` +
`Stepper` + `AttendeeStep`/`TicketStep`/`ConsentStep`, `PhoneCountryField`,
`ConfirmationTicket` + `QRCodeDisplay`, `AddToCalendar` (.ics + Google link),
`AttendeeDashboard`. Mutations via Server Actions.

## 10. Micro-interactions

Hero parallax (CSS scroll-timeline), capacity bar fill-on-mount (800ms), wizard step
slide (framer-motion, 24px, 220ms), ticket-card select scale 1.015, CTA gradient-angle
hover (stacked-gradient opacity). All gated by `prefers-reduced-motion`.

## 11. Error handling

- `PretixValidationError.fieldErrors` → per-field wizard errors.
- Sold-out / quota-exhausted at submit → friendly "just sold out" with waitlist CTA stub.
- Email failure must not fail the registration (log + continue; order still created).
- Magic-link invalid/expired → generic "link invalid" page, no info leak.

## 12. Testing

Unit (offline): public event filtering (visibility/coming-soon), payment-provider
selection (free vs COD branch), registration service (free→paid+QR+AttendeeOrder;
COD→pending; email-failure tolerated), magic-link sign/verify, email dev transport,
`.ics` generation, capacity-state helper, consent validation.
Integration (gated, real DB + mocked pretix): register writes AttendeeOrder + status.
Live e2e (gated, real pretix): register → order created (free paid / COD pending).
UI verified by build + live walkthrough.

## 13. Acceptance Criteria

1. `/events` lists published public events (open vs coming-soon); capacity states shown.
2. `/events/[slug]` shows hero/tickets/details; register CTA; add-to-calendar/.ics.
3. Wizard (3 steps) creates a pretix order; free → confirmation + QR; COD → payment-pending, no QR.
4. Local `AttendeeOrder` recorded; guest magic-link `/t/[token]` shows the ticket when issued.
5. `/my-tickets` lists a logged-in attendee's orders.
6. Light/dark theme toggle works; Arabic RTL is first-class.
7. Email sends via SMTP when configured, else logs in dev; email failure doesn't break registration.
8. `npm test` / `typecheck` / `lint` / `build` green.

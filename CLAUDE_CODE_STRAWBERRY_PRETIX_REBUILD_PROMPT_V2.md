# Claude Code Prompt — Rebuild Strawberry Events Platform From Scratch

You are Claude Code. Recreate the entire Strawberry Agency event registration platform **from scratch**. You do **not** have access to the old version, so everything needed is described here.

The old platform was a custom Next.js/Supabase/Stripe/Resend registration platform. The new version must keep the same business flow and user experience, but the backend engine must be rebuilt around **self-hosted pretix open-source** as the core event/order/ticket/check-in backend.

The platform name is:

```text
Strawberry Events Platform
```

Branding:

```text
Strawberry Agency branded
Modern premium UI
Mobile-first
English + Arabic support
Light animation
```

Primary goals:

```text
A) Beautiful premium event frontend
B) Powerful organizer/admin operations
```

Do not build a weak demo. Build a real production-ready foundation that can scale to 50,000 attendees on a VPS using Docker.


---

# V2 Critical Clarifications Addendum — MUST FOLLOW

This addendum overrides any vague or conflicting instruction elsewhere in this file. Claude Code must treat these as locked product decisions.

## A. Hybrid Badge Printing Mode

Badge printing must be implemented as a **hybrid system**.

Support two badge printing modes:

```text
1. pretixSCAN-native badge printing where possible.
2. Custom Next.js print station mode for browser-based thermal 4x6 printing.
```

Rules:

- pretixSCAN remains the primary official check-in scanner.
- Do not assume a mobile pretixSCAN app can directly trigger a random browser print dialog.
- If using pretixSCAN-native printing, configure it through pretix/pretixSCAN-supported badge printing behavior.
- If using the custom Next.js staff dashboard, scanning and printing happen inside the browser from a dedicated check-in/print-station page.
- Build the custom print station so staff can:
  - scan/search attendee,
  - validate payment/approval/check-in eligibility,
  - check in attendee,
  - automatically print badge after successful scan,
  - manually reprint badge.
- Badge size is **4x6 thermal**.
- Badge content must include:

```text
ROLE TAG: MEDIA / PARTNER / STAFF / SPEAKER / VISITOR
Full Name
Company
QR Code
```

- Different badge templates are required per role/tag, but the main visible difference is the top tag.

---

## B. COD / Manual Payment Behavior

COD/manual payment is required now. Whish is added later.

For COD/manual payments:

- Create the order in pretix as pending/unpaid.
- Reserve event/session/seat capacity while the payment deadline is active.
- Do not show downloadable QR/ticket PDF to the attendee until the order is marked paid.
- Do not send the final ticket confirmation email until the order is marked paid.
- Check-in must reject unpaid/pending orders.
- Finance/Admin marking the order as paid must trigger ticket delivery email.
- COD ticket validity is controlled by payment status.
- COD/manual payment availability is decided per event.

Payment completion rule:

```text
Pending unpaid order
→ Finance/Admin marks paid
→ Ticket/QR becomes available
→ Email confirmation/ticket is sent
→ Check-in becomes valid
```

---

## C. Waitlist Support

Waitlist is required.

Add waitlist support with these rules:

- Waitlist can be enabled/disabled per event and per ticket/session.
- If ticket/session/seat capacity is full, the user can join the waitlist.
- Store waitlist position and status.
- Admin can manually promote waitlisted attendees.
- Automatic promotion can be enabled per event.
- Promoted users receive an email.
- Promoted users must complete approval/payment if required by the event or ticket.
- Waitlist must respect organizer isolation.
- Waitlist must work with seated and non-seated events.

---

## D. Seat Selection Requirements

Seat selection is required and must be optional per event.

Rules:

- General admission events skip seat selection.
- Seated events require a visual seat selector.
- Seat maps are configured per event.
- Seat states:

```text
available
temporarily_held
sold_or_reserved
blocked
accessible
```

- Temporary seat holds expire after **10 minutes** if checkout is not completed.
- COD/manual unpaid seats remain reserved until payment deadline.
- If order expires/cancels, the seat is released.
- Use pretix seating plans where possible.
- If pretix support is insufficient for the custom UI, create a custom seat-map layer synced to pretix order positions.
- Seat selection rules are decided per event.

---

## E. Multi-Organizer pretix Mapping

Do not rely on one global organizer in production.

Rules:

- Each Strawberry platform organization must map to a pretix organizer slug.
- Store this mapping in the custom database.
- `PRETIX_DEFAULT_ORGANIZER=strawberry` is only for local development/demo seed data.
- Production code must always resolve the pretix organizer from the authenticated user’s organization or the event mapping.
- API keys, dashboards, reports, attendee lists, finance data, and events must never cross organizer boundaries.

Suggested table:

```text
organizations
- id
- name
- slug
- pretix_organizer_slug
- created_at
- updated_at
```

---

## F. Payment Provider Abstraction

Create a payment provider abstraction from day one.

Do not hardcode COD in a way that makes Whish difficult later.

Required interface concept:

```ts
interface PaymentProvider {
  id: string
  label: string
  enabled: boolean
  createPayment(order: PlatformOrder): Promise<PaymentIntent>
  verifyWebhook(request: Request): Promise<PaymentWebhookResult>
  markPaid(order: PlatformOrder): Promise<void>
  cancelPayment(order: PlatformOrder): Promise<void>
}
```

Implement now:

```text
manual_cod provider
```

Add placeholder/disabled provider now:

```text
whish provider
```

Whish configuration must appear later under:

```text
Admin Panel → Settings → Integrations → Payment Providers → Whish
```

For now, Whish fields can exist but remain disabled until credentials/API flow are added.

---

## G. Naming: Partner, Not Sponsor

Do not use `sponsor` as an attendee/status tag.

Use this fixed role/status set:

```text
media
partner
staff
speaker
visitor
```

Public website sections may still say “Partners” or “Event Partners”. Avoid building a separate `sponsor` tag unless explicitly requested later.

---

## H. Bilingual Content Fields

English and Arabic are required.

Do not only translate static UI labels. Event content must support bilingual fields.

Required bilingual fields include:

```text
event title_en / title_ar
event description_en / description_ar
agenda title/body_en / title/body_ar
session title/description_en / title/description_ar
speaker name can be shared, but bio_en / bio_ar required
partner description_en / description_ar
custom registration field label_en / label_ar
custom registration field help_text_en / help_text_ar
email template subject_en / subject_ar
email template body_en / body_ar
```

Arabic UI must support RTL layout.

---

## I. Guest Checkout + Attendee Dashboard

Attendee accounts depend on the event.

Support both:

```text
1. guest checkout
2. attendee account checkout
```

If guest checkout is enabled, attendees must still access tickets through:

```text
secure magic link
or
order code + email verification
```

Do not require a password account for guest-only events.

Attendee dashboard must support:

- my active tickets,
- past events/history,
- workshop/session schedule,
- ticket download when eligible,
- payment/approval status.

---

## J. Approval + Payment Timing

Approval behavior is decided per event.

Support:

```text
approval disabled
manual approval
automatic approval rules
manual + automatic approval rules
```

Payment timing is also decided per event.

Default rule:

```text
register → wait for approval → then pay
```

Optional event setting:

```text
register + pay first → admin approves later
```

If pay-before-approval is enabled and attendee is rejected, do not implement user refund requests now. Mark the order according to admin/finance handling and leave refund/payment reversal as manual/admin-managed.

---

## K. Session / Workshop Check-in Logic

Sessions/workshops are required.

Rules:

- Sessions/workshops have separate capacities.
- Attendees can register for multiple workshops.
- Conflict prevention is required. A user cannot register for two sessions that overlap in time.
- Sessions can have separate QR check-ins.
- Sessions can have separate badge behavior/templates if required.
- The same attendee ticket QR may be scanned against different check-in lists:

```text
main entrance
hall entrance
individual session/workshop
```

Each attendee must have:

```text
main event check-in status
session-level check-in statuses
```

---

## L. API Access, API Keys, and Rate Limiting

Full API access is required and must be generated from the admin panel.

Rules:

- API keys must never bypass organizer isolation.
- Every API key must include:
  - organization restriction,
  - optional event restriction,
  - scopes,
  - rate limit,
  - optional expiration date,
  - created_by user,
  - last_used_at,
  - revoked_at.
- API keys must be hashed before storage.
- Provide admin UI for creating, revoking, and viewing API keys.
- Add webhook support.
- Add rate limiting for API endpoints.

Suggested scopes:

```text
events:read
events:write
attendees:read
attendees:write
orders:read
orders:write
checkin:read
checkin:write
finance:read
webhooks:manage
```

---

## M. Archive / Delete Behavior

Deleted attendees/orders must be archived for two weeks, then purged from the custom Strawberry layer.

Rules:

- Do not physically delete pretix orders by default.
- For pretix, prefer cancellation/archive/status changes instead of destructive deletion.
- Use the custom app archive table for soft-deleted custom records.
- Purge local custom archived snapshots after 14 days.
- Audit logs must remain.

---

## N. Missing Original Flow Requirements to Preserve

Preserve these original platform flow requirements:

- Public event listing has an open events area and a coming-soon area/sidebar.
- Event detail page must include event location and map display.
- Registration form must include phone country code selector.
- Registration must include required consent checkboxes:

```text
I agree to the Terms and Conditions
I agree to the Privacy Policy / data processing policy
```

- Confirmation page must provide:
  - ticket download when eligible,
  - add to Google Calendar link,
  - download `.ics` calendar file,
  - event location/map link.
- Private/hidden events are supported.
- Event approval/payment/session settings are decided during event creation.

---

## O. Final Locked Priority

Primary product priority is:

```text
A) Beautiful premium event frontend
B) Powerful organizer/admin operations
```

Optimize implementation around these two goals before adding future extras.


---

## 1. High-Level Architecture

Build a multi-organizer event registration and operations platform using:

```text
Cloudflare
  ↓
Next.js frontend + admin panel
  ↓
Custom integration layer / API adapter
  ↓
pretix REST API + pretix plugins
  ↓
pretix backend
  ↓
PostgreSQL + Redis
  ↓
pretixSCAN + thermal badge printing + SMTP + WhatsApp/SMS later
```

### Core Rule

pretix is the **source of truth** for:

- events
- ticket products
- variations
- orders
- attendees
- payments status
- QR tickets
- check-in lists
- workshop/session capacities
- reports/exportable ticketing data

The custom Next.js app is responsible for:

- public website
- premium event pages
- custom registration flow
- custom admin dashboard
- organizer isolation layer
- badge printing UI
- approval workflows UI
- integrations settings UI
- API key management UI
- external API layer
- multilingual UI

Do **not** rebuild core ticketing logic if pretix can handle it. Use pretix APIs and extend through plugins where needed.

---

## 2. Tech Stack

Use this stack unless there is a strong reason not to:

```text
Frontend/Admin: Next.js 16 App Router + TypeScript
Styling: Tailwind CSS v4
UI: shadcn/ui or equivalent accessible component system
Animation: framer-motion or lightweight CSS animations
Forms: react-hook-form + Zod
Auth: Auth.js / NextAuth or custom secure auth
Backend adapter: Next.js Route Handlers / Server Actions
Database for custom layer: PostgreSQL
ORM: Prisma or Drizzle
Ticket backend: self-hosted pretix
Queue/cache: Redis
Deployment: Docker Compose
Reverse proxy: Nginx or Traefik behind Cloudflare
Printing: browser print + thermal 4x6 layouts
QR scanning: pretixSCAN primarily, optional custom scanner if needed
Languages: English + Arabic, with RTL support for Arabic
```

### Docker Services

Create a Docker-ready project with services for:

```text
next-app
pretix
postgres
redis
nginx or traefik
worker/background jobs if needed
```

The result should be deployable on a VPS.

---

## 3. Platform Type

This is a **multi-organizer** platform.

### Organizer isolation

Organizers are isolated:

```text
Organizer A sees only Organizer A events, attendees, finance, settings, staff, exports, API keys.
Organizer B sees only Organizer B data.
Super Admin sees everything.
```

### Event creation

Only admins/staff can create events. Public users cannot create events.

### Multiple admins per event

One event can have multiple admins/staff assigned.

### Organizer branding/domain

Do not build custom domains or custom organizer branding for now. Keep the public brand as Strawberry Agency.

---

## 4. Roles and Permissions

Implement role-based access control.

Required roles:

```text
Super Admin
Organizer Admin
Check-in Staff
Finance
Attendee/User
Guest/Public
```

### Role permissions

#### Super Admin

Can:

- manage all organizers
- manage all events
- manage all staff/admins
- view all finance data
- configure global integrations
- generate/revoke API keys
- view audit logs
- manage archived/deleted data

#### Organizer Admin

Can:

- manage assigned organizer events
- create/edit/delete/archive events
- create tickets/products
- manage registrations
- approve/decline attendees
- import/export attendees
- create manual orders
- manage staff assigned to their organizer/events
- configure event-level rules
- view assigned organizer finance data

Cannot see other organizers.

#### Check-in Staff

Can:

- access assigned check-in events/sessions only
- use pretixSCAN or custom check-in view
- see attendee name, last name, company, status/tag
- trigger automatic badge printing after scan
- manually reprint badge
- do walk-in registration if allowed by event settings

Cannot access finance or global settings.

#### Finance

Can:

- see assigned organizer/event payment data
- mark COD/manual orders as paid
- export finance reports
- issue/download invoices/receipts PDFs

Cannot modify event design or system settings unless also admin.

#### Attendee/User

Depending on event settings, attendee account can be:

```text
required
optional
disabled/guest checkout only
```

If attendee dashboard is enabled, they can view:

- current tickets
- downloadable tickets
- QR codes
- past event history
- workshop/session schedule

#### Guest/Public

Can:

- browse public events
- access hidden/private events if they have direct link or invite link
- start registration depending on event settings

---

## 5. Public Website Routes

Create these routes.

```text
/
/events
/events/[eventSlug]
/events/[eventSlug]/register
/events/[eventSlug]/checkout
/events/[eventSlug]/pending-approval
/events/[eventSlug]/payment-pending
/events/[eventSlug]/confirmation/[orderCode]
/my-tickets
/my-history
/login
/register
/forgot-password
/reset-password
```

### `/`

Redirect or render landing page leading to `/events`.

### `/events`

Public event listing.

Requirements:

- show published public events
- show private events only if invite/private link is provided
- show coming-soon events separately
- premium Strawberry Agency style
- event cards with date, location, availability, status
- capacity indicator: green, amber, red
- mobile-first layout
- English/Arabic support

### `/events/[eventSlug]`

Event details page.

Must show:

- event title
- description
- image/banner
- date/time
- location/map area
- organizer name
- agenda/schedule
- speakers section
- sponsors section
- available tickets
- workshop/session highlights
- countdown timer
- register button
- coming-soon / sold-out / private / approval-required indicators

### `/events/[eventSlug]/register`

Registration flow.

Default flow:

```text
Step 1 → Attendee details
Step 2 → Ticket selection
Step 3 → Modular questions / consent
Step 4 → Checkout / approval state
```

Required default attendee fields:

```text
First name
Last name
Email
Phone
Company
```

Fields must be modular per ticket type.

Examples:

```text
Media ticket → media outlet, press ID, website
Speaker ticket → bio, talk title, topic
Partner ticket → company, booth details
Visitor ticket → default fields only
```

### `/events/[eventSlug]/checkout`

Checkout stays on the website.

Payment methods:

```text
COD / manual payment now
Whish later via plugin/integration
Other gateways later from admin integrations
```

For COD/manual payment:

```text
User registers
→ pretix order is created as pending/unpaid
→ admin/finance marks paid
→ ticket QR becomes valid/issued
```

For Whish later:

```text
User registers on website
→ create pending pretix order
→ create Whish payment request
→ user completes Whish payment
→ Whish webhook confirms payment
→ mark pretix order as paid
→ ticket QR becomes valid/issued
```

Do not implement Whish now unless credentials/API docs are available. Create clean placeholders/settings and plugin architecture.

### `/events/[eventSlug]/pending-approval`

Shown if event/ticket requires approval.

Approval flow is decided during event creation. Some events/tickets require approval, some do not.

Support:

```text
register → wait for approval → then pay/confirm
```

and, if configured:

```text
register → auto approval rules → approved automatically if rule matches
```

### `/events/[eventSlug]/confirmation/[orderCode]`

Confirmation page after successful approval/payment.

Show:

- event details
- attendee name
- ticket type
- QR code
- order code
- download ticket/PDF
- add to calendar
- workshop/session schedule if selected
- map/location

### `/my-tickets` and `/my-history`

Attendee dashboard.

Must show:

- active tickets
- QR code/ticket download
- past event history
- sessions/workshops selected
- payment status if relevant

---

## 6. Admin Routes

Create a full admin panel.

```text
/admin
/admin/organizers
/admin/events
/admin/events/new
/admin/events/[id]/edit
/admin/events/[id]/tickets
/admin/events/[id]/sessions
/admin/events/[id]/approvals
/admin/events/[id]/attendees
/admin/events/[id]/checkin
/admin/events/[id]/badges
/admin/events/[id]/finance
/admin/registrations
/admin/users
/admin/staff
/admin/finance
/admin/invoices
/admin/settings
/admin/settings/integrations
/admin/settings/smtp
/admin/settings/api-keys
/admin/settings/webhooks
/admin/audit-logs
/admin/archive
```

### Admin Dashboard

Show:

- upcoming events
- recent registrations
- pending approvals
- ticket sales summary
- check-in counters
- quick links

No need for complex advanced revenue analytics yet.

### Organizer management

Super admin can create/manage organizers.

Each organizer has:

```text
id
name
slug
status
assigned admins
assigned finance users
assigned check-in staff
created_at
updated_at
```

Organizer isolation must apply everywhere.

### Event creation/editing

Event creation must include:

- organizer assignment
- title
- slug
- description
- image/banner
- date/time
- timezone
- location
- map coordinates/manual location field
- capacity
- status: draft / published / hidden/private / archived
- registration open/close dates
- coming-soon mode
- public/private visibility
- account requirement mode: required / optional / guest only
- approval mode
- automatic approval rules
- ticket quantity limits per order
- price stages per event
- coupon/private ticket settings
- workshop/session settings
- check-in list settings
- badge template selection
- email template selection
- COD/manual payment settings
- Whish/payment plugin placeholder settings

### Ticket management

Tickets are pretix products/variations.

Support:

- named tickets
- transferable tickets by admin only
- downloadable tickets
- not Apple/Google Wallet compatible for now
- quantity per order limits decided per event
- price stages per event
- coupons
- private/hidden/invite-only tickets
- modular form fields per ticket
- ticket tag/status default

Ticket statuses/tags:

```text
media
partner
staff
visitor
speaker
```

### Approval management

Approvals can be:

```text
manual
automatic
manual + automatic
not required
```

Approval mode is decided during event creation.

Admin should be able to:

- view pending approvals
- filter by event/ticket/status
- approve one
- decline one
- bulk approve
- apply automatic rules
- add internal notes
- trigger confirmation email after approval

### Session/workshop management

Sessions/workshops must support:

- separate capacities
- separate QR check-ins
- separate badges if needed
- multiple sessions per attendee
- conflict prevention for overlapping sessions
- individual check-in lists
- session-level counters
- session registration as part of attendee flow

If an attendee tries to choose two overlapping sessions, block it.

### Attendee/registration management

Admin can:

- view all attendees for assigned events
- search by name/email/company/phone/order code/QR code/tag
- create manual attendee/order
- import attendees
- export CSV
- edit attendee details
- assign ticket
- assign sessions
- change tag/status
- mark COD/manual order as paid if permitted
- download invoice/receipt PDF
- archive attendee/order

### Finance

Finance role and admin can:

- view payment status
- view COD/manual pending orders
- mark COD/manual as paid
- export reports
- download receipt/invoice PDFs

Payouts to organizers are handled externally, not through platform.

### Settings → Integrations

Create settings pages for:

```text
SMTP
Whish placeholder
Custom integrations
SMS
WhatsApp
Webhooks
API keys
Cloudflare/public URLs
```

#### SMTP settings

Use custom SMTP, configured in admin:

```text
Host
Port
Username
Password
From name
From email
Encryption: none / TLS / SSL
Test email button
```

Store secrets securely. Do not expose passwords to client.

#### Custom integrations

Build a generic integrations settings section where future integrations can be added.

Include placeholders for:

```text
Whish API
WhatsApp provider
SMS provider
CRM webhook
```

### API keys

Admins can generate full API access from the admin panel.

API key system must support:

- generate key
- revoke key
- name/label
- scopes
- organizer/event restrictions
- last used at
- created by
- rate limiting

### Webhooks

Support webhooks for external systems:

- attendee created
- attendee approved
- attendee declined
- order created
- order paid
- check-in completed
- badge printed
- session registered
- session checked in

Admin can configure webhook URL, secret, active/inactive.

### Audit logs

Required.

Track:

- who created/edited/deleted/archived event
- who approved/declined attendee
- who marked order as paid
- who printed badge
- who checked in attendee
- who generated/revoked API key
- who changed settings

---

## 7. Staff Flow

Create staff routes:

```text
/staff
/staff/checkin
/staff/registrations
/staff/events
/staff/badges
```

### Check-in flow

Primary check-in tool is pretixSCAN.

However, the custom staff dashboard should support operational flow around it:

- select assigned event
- select entrance/hall/session if applicable
- show live counters
- show room/session counters
- show occupancy limits
- search attendee manually
- display attendee card
- trigger manual badge print/reprint

At check-in, staff must see:

```text
First name
Last name
Company
Status/tag
```

### Required counters

Need:

- live attendance counters
- event counters
- room counters
- session counters
- multiple entrance support
- multiple hall support
- workshop/session support

### Walk-in registration

Staff/admin can manually create registration if event allows it.

Walk-in flow:

```text
Staff selects event
→ opens Quick Register
→ enters first name, last name, email/phone/company, tag
→ selects ticket/session if needed
→ creates pending/confirmed order depending on payment rule
→ can check in and print badge
```

---

## 8. Badge Printing System

Badge printing is a core feature.

### Badge requirements

```text
Printer type: thermal
Badge size: 4x6
Print timing: at check-in only
Print modes: automatic after scan + manual reprint
```

### Badge content

Badge must show:

```text
TAG ON TOP: MEDIA / STAFF / PARTNER / SPEAKER / VISITOR
Full Name
Company
QR Code
```

The badge tag changes by attendee status.

### Badge templates

Different templates are required, but the main difference is the tag on top.

Tags:

```text
media
staff
partner
speaker
visitor
```

Each tag should have clear visual differentiation.

Use print CSS optimized for 4x6 thermal printer.

Create:

```text
/admin/events/[id]/badges
/staff/badges
/components/badges/BadgeTemplate.tsx
/components/badges/BadgePrintDialog.tsx
```

Badge should print automatically after successful scan if event setting is enabled.

Also support manual print/reprint.

---

## 9. Payment Logic

### Payment methods

Currently required:

```text
COD / manual payment
```

Later:

```text
Whish
other payment gateways through admin integrations
```

### COD/manual payment rule

For COD/manual:

```text
Ticket QR should only be valid/issued after admin/finance marks the order as paid.
```

Meaning:

```text
Registration submitted
→ pretix order created as unpaid/pending
→ attendee may receive pending email
→ finance/admin marks paid
→ confirmation email sent
→ ticket QR downloadable/valid
```

### Whish future architecture

Prepare a clean integration point for Whish:

```text
Next.js checkout UI
→ create pending pretix order
→ create Whish payment request
→ receive Whish webhook
→ verify webhook signature
→ mark pretix order as paid
→ send confirmation email
```

Build the code structure so Whish can be added later without rewriting checkout.

Do not hardcode Stripe/PayPal as the main payment systems.

Currency:

```text
USD only
No currency conversion
```

No partial payments, deposits, or installments.

No refund request system for now.

---

## 10. Ticketing Logic

### Ticket features

Support:

- named tickets
- admin-only transfers
- downloadable ticket PDFs
- seat selection
- per-event quantity limits
- price stages per event
- coupons
- hidden/private tickets
- invite-only tickets
- modular questions per ticket

Do not support Apple Wallet / Google Wallet yet.

### Seat selection

Seat selection is required.

Build a flexible structure that can support:

- general admission events with no seats
- seated events with sections/rows/seats
- reserved seats
- sold/unavailable seats
- accessible seat marking if possible

Store mapping in custom layer if pretix default support is insufficient.

---

## 11. Email, WhatsApp, and SMS

### Email

Use custom SMTP configured in admin settings.

Emails needed:

- registration pending
- pending approval
- approved/confirmation with QR
- declined
- COD payment pending
- payment confirmed
- reminder
- workshop/session reminder
- password reset
- account verification if accounts enabled
- manual resend

Email templates should be customizable by organizer/admin.

### WhatsApp/SMS

WhatsApp reminders: required later.
SMS reminders: required later.

Build integration placeholders in admin settings.

No notification logs are required for now.

---

## 12. Frontend UI/UX Requirements

Use a modern, premium Strawberry Agency visual style.

### Visual direction

```text
Clean luxury event platform
Rose/strawberry accent
Dark/light friendly components
Smooth micro-animations
Large readable typography
Mobile-first design
Arabic RTL support
```

### Pages should feel premium

Avoid generic admin templates. Use cards, glass effects where appropriate, clean spacing, modern dashboard components, and clear event visuals.

### Languages

Support:

```text
English
Arabic
```

Arabic must use RTL layout.

Build i18n structure from the start.

---

## 13. Data Model for Custom Layer

Use pretix for core ticket/order data, but create a custom database for platform-specific data that pretix does not naturally own.

Suggested custom tables/models:

```text
organizations
organization_members
user_profiles
event_mappings
pretix_object_mappings
seat_maps
seat_sections
seat_rows
seat_assignments
badge_templates
badge_print_logs
approval_rules
approval_requests
custom_form_fields
custom_form_answers
integration_settings
smtp_settings
api_keys
webhooks
webhook_deliveries
audit_logs
archive_queue
```

### organizations

```text
id
name
slug
status
created_at
updated_at
```

### organization_members

```text
id
organization_id
user_id
role: super_admin | organizer_admin | checkin_staff | finance
assigned_event_ids optional
created_at
updated_at
```

### event_mappings

Maps local platform events to pretix events.

```text
id
organization_id
local_event_id
pretix_organizer_slug
pretix_event_slug
pretix_event_id if available
visibility: public | private | hidden
account_mode: required | optional | guest
approval_mode: none | manual | automatic | manual_and_automatic
badge_auto_print boolean
created_at
updated_at
```

### custom_form_fields

```text
id
organization_id
event_id
ticket_id nullable
label_en
label_ar
type
required boolean
options json
sort_order
created_at
updated_at
```

### approval_rules

```text
id
event_id
ticket_id nullable
name
conditions json
action: approve | require_manual | decline
active boolean
created_at
updated_at
```

### api_keys

```text
id
organization_id nullable
name
key_hash
scopes json
event_restrictions json
created_by
last_used_at
revoked_at
created_at
```

### audit_logs

```text
id
organization_id nullable
event_id nullable
actor_user_id
action
entity_type
entity_id
before json
after json
ip_address
user_agent
created_at
```

### archive_queue

Deleted/removed attendees/orders should be archived for 2 weeks, then permanently removed.

```text
id
entity_type
entity_id
payload json
archived_at
purge_after
purged_at
```

---

## 14. pretix Integration Requirements

Create a clean pretix adapter layer.

Example structure:

```text
/lib/pretix/client.ts
/lib/pretix/events.ts
/lib/pretix/orders.ts
/lib/pretix/products.ts
/lib/pretix/checkin.ts
/lib/pretix/vouchers.ts
/lib/pretix/questions.ts
/lib/pretix/webhooks.ts
/lib/pretix/errors.ts
```

The adapter should handle:

- authentication to pretix API
- organizer/event mapping
- creating/updating events
- creating products/tickets
- creating orders
- marking manual/COD payments
- reading order/payment status
- creating questions/custom fields if using pretix questions
- check-in list retrieval
- voucher/coupon handling
- webhook verification/processing if used

Do not scatter raw pretix API calls throughout the app.

All pretix calls must pass through the adapter.

---

## 15. API Routes for Custom Platform

Create API routes under `/api`.

Suggested routes:

```text
/api/auth/*
/api/events
/api/events/[id]
/api/events/[id]/tickets
/api/events/[id]/register
/api/events/[id]/checkout
/api/events/[id]/sessions
/api/events/[id]/seat-map
/api/admin/organizations
/api/admin/events
/api/admin/events/[id]
/api/admin/events/[id]/tickets
/api/admin/events/[id]/sessions
/api/admin/events/[id]/approvals
/api/admin/events/[id]/attendees
/api/admin/events/[id]/finance
/api/admin/events/[id]/badges
/api/admin/attendees/[id]/approve
/api/admin/attendees/[id]/decline
/api/admin/orders/[id]/mark-paid
/api/admin/orders/[id]/transfer-ticket
/api/admin/import
/api/admin/export
/api/admin/settings/smtp
/api/admin/settings/integrations
/api/admin/api-keys
/api/admin/webhooks
/api/admin/audit-logs
/api/staff/events
/api/staff/search
/api/staff/checkin
/api/staff/walkin
/api/staff/badges/print
/api/public/v1/*
/api/webhooks/pretix
/api/webhooks/whish-placeholder
/api/webhooks/custom/[id]
```

### External API

Full API access is required and generated from admin panel.

Create `/api/public/v1` with API key auth and rate limiting.

Support endpoints for:

- list events
- get event details
- list attendees if scope allows
- create attendee/order if scope allows
- read check-in status
- receive webhooks

---

## 16. Security Requirements

Implement:

- RBAC everywhere
- organizer isolation everywhere
- secure API key hashing
- rate limiting
- CSRF protection where needed
- webhook signature verification
- server-only secrets
- no secret leakage to frontend
- audit logs
- archived deletion flow
- input validation with Zod
- safe file import validation

### Deleted data rule

Deleted attendees/orders are archived for 2 weeks, then permanently removed.

```text
delete action
→ archive snapshot for 14 days
→ purge job removes permanently after 14 days
```

---

## 17. Infrastructure and Deployment

### Deployment

Use Docker.

Create:

```text
Dockerfile
compose.yaml
.env.example
nginx.conf or traefik config
scripts/backup.sh
scripts/restore.sh
scripts/seed.ts
```

### Required infra

```text
VPS deployment
Cloudflare in front
Weekly backups
Redis
PostgreSQL
pretix
Next.js app
```

### Backup policy

Weekly backups required.

Back up:

- custom PostgreSQL database
- pretix PostgreSQL database if separate
- pretix media/data
- uploaded assets
- environment/config references excluding secrets in repo

---

## 18. Old Platform Flow To Preserve

The previous platform had these flows. Recreate them in the new architecture, adapted to pretix.

### Public flow

```text
User visits /
→ sees event list
→ opens event details
→ sees tickets, availability, location, agenda, sponsors/speakers
→ clicks register
→ fills 4-step registration
→ chooses ticket/session/seat if applicable
→ submits
→ if approval required: pending approval
→ if COD/manual: pending payment until admin marks paid
→ if free/auto-approved: confirmation
→ receives ticket/QR once confirmed/paid
→ can download ticket PDF
→ can see ticket in attendee dashboard
```

### Admin flow

```text
Admin logs in
→ dashboard
→ creates organizer/event
→ creates tickets
→ sets approval rules
→ sets price stages/coupons/private tickets
→ configures sessions/workshops
→ configures badge template
→ manages registrations
→ approves attendees
→ marks COD orders paid
→ exports reports
→ views audit logs
```

### Staff flow

```text
Staff logs in
→ sees assigned events only
→ selects event/entrance/session
→ uses pretixSCAN or search
→ checks in attendee
→ badge prints automatically
→ can reprint manually
→ live counters update
```

---

## 19. Key Differences From Old Version

Do not recreate the old stack exactly.

Old version used:

```text
Supabase as main backend
Stripe/PayPal as main payment
Resend as email
custom QR/check-in logic
```

New version must use:

```text
pretix as ticketing/order/check-in backend
custom Next.js frontend/admin
custom SMTP
COD/manual payment now
Whish integration later
Docker VPS deployment
multi-organizer isolation
```

Do not add Stripe/PayPal unless implemented as optional future integrations.

---

## 20. Initial Development Milestones

Build in this order.

### Milestone 1 — Project Foundation

- initialize Next.js 16 TypeScript app
- Tailwind and design system
- English/Arabic i18n with RTL
- auth and roles
- custom database schema/migrations
- Docker Compose with Next.js, pretix, Postgres, Redis
- environment setup

### Milestone 2 — pretix Adapter

- create pretix API client
- create organizer/event mapping
- list/create/update events through adapter
- create products/tickets through adapter
- create pending orders through adapter
- read order/ticket/check-in status

### Milestone 3 — Admin Events

- organizer isolation
- event list/create/edit
- ticket management
- settings per event
- private/public/hidden events
- modular fields
- approval mode

### Milestone 4 — Public Registration

- event listing
- event details
- registration wizard
- ticket/session/seat selection
- pending approval page
- COD/manual pending payment flow
- confirmation/ticket page

### Milestone 5 — Approval and Finance

- approval dashboard
- automatic approval rules
- COD/manual mark-paid
- confirmation email after paid/approved
- invoice/receipt PDF

### Milestone 6 — Staff and Check-in

- staff assigned events
- live counters
- pretixSCAN integration instructions/links
- manual search
- badge auto-print after scan
- manual reprint

### Milestone 7 — Integrations and API

- SMTP settings
- API keys
- external API routes
- webhooks
- audit logs
- WhatsApp/SMS placeholders
- Whish placeholder integration structure

### Milestone 8 — Production Hardening

- rate limiting
- backups
- archive/purge job
- Cloudflare-ready config
- logging
- validation
- error boundaries
- testing

---

## 21. Required UI Components

Create reusable components:

```text
PublicNav
LanguageSwitcher
EventCard
EventList
EventHero
EventAgenda
SpeakerSection
SponsorSection
AvailabilityBar
RegistrationWizard
TicketSelector
SeatSelector
SessionSelector
CustomFieldRenderer
ApprovalPendingCard
CheckoutMethodSelector
ConfirmationTicket
QRCodeDisplay
AttendeeDashboard
AdminSidebar
AdminHeader
OrganizerSwitcher
EventForm
TicketBuilder
SessionBuilder
ApprovalRulesBuilder
AttendeeTable
FinanceTable
SettingsTabs
SMTPSettingsForm
IntegrationsSettingsForm
APIKeyManager
WebhookManager
AuditLogTable
StaffSidebar
CheckInEventSelector
StaffAttendeeSearch
LiveCounters
BadgeTemplate
BadgePrintDialog
```

---

## 22. Required Environment Variables

Create `.env.example` with:

```env
# App
APP_URL=https://events.yourdomain.com
NEXTAUTH_URL=https://events.yourdomain.com
NEXTAUTH_SECRET=change_me
NODE_ENV=development

# Custom DB
DATABASE_URL=postgresql://app:password@postgres:5432/strawberry_platform

# pretix
PRETIX_BASE_URL=https://pretix.yourdomain.com
PRETIX_API_TOKEN=change_me
PRETIX_DEFAULT_ORGANIZER=strawberry

# Redis
REDIS_URL=redis://redis:6379

# SMTP default/fallback
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM_NAME=Strawberry Agency
SMTP_FROM_EMAIL=noreply@strawberryagency.com
SMTP_SECURE=false

# Security
API_KEY_PEPPER=change_me
WEBHOOK_SECRET=change_me

# Future integrations placeholders
WHISH_API_BASE_URL=
WHISH_CLIENT_ID=
WHISH_CLIENT_SECRET=
WHISH_WEBHOOK_SECRET=
SMS_PROVIDER=
SMS_API_KEY=
WHATSAPP_PROVIDER=
WHATSAPP_API_KEY=

# Cloudflare / reverse proxy
TRUST_PROXY=true
```

---

## 23. Acceptance Criteria

The build is acceptable only if:

- the app runs locally with Docker Compose
- pretix is integrated as the backend engine
- organizers are isolated
- admins can create events and tickets
- public users can register
- COD/manual payment creates pending unpaid order
- finance/admin can mark paid
- confirmed/paid attendees can access QR/ticket
- approval flow works
- sessions/workshops have capacity and conflict prevention
- staff can see assigned events
- badge template prints in 4x6 layout
- Arabic and English UI switch works
- API key generation works
- rate limiting exists for public API
- audit logs are written for critical actions
- weekly backup script exists
- deleted data goes to archive for 2 weeks before purge

---

## 24. Important Implementation Notes

- Build cleanly and modularly.
- Do not hardcode one organizer.
- Do not let organizers see each other’s data.
- Do not expose pretix API token to frontend.
- Do not scatter pretix API calls; use the adapter layer.
- Treat pretix as source of truth for orders/tickets/check-ins.
- Treat Next.js as the premium custom UX and admin operations layer.
- Keep Whish as a clean future plugin/integration point.
- Keep payment method architecture extensible.
- Use USD only.
- No currency conversion.
- No Apple/Google Wallet.
- No refund request system.
- Do not build exhibitor portal, sponsor portal, networking/chat, AI matchmaking, mobile app, NFC badges, lead scanning, or certificate generation now.

---

## 25. Start Now

Begin by creating the repository structure, database schema, Docker Compose setup, pretix adapter skeleton, authentication/roles, and the main route layout. Then proceed milestone by milestone.

Before implementing complex pretix operations, create typed adapter interfaces so the UI can be built against stable functions.

Use TODO comments only where external credentials/API docs are required, especially for Whish, WhatsApp, and SMS.

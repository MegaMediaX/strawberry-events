# Strawberry Events — agent notes

Registration, check-in and badge-printing platform (ran LEBTECH 2026, 28–30 Aug).
Next.js 16 + self-hosted pretix + Postgres 16. Current status: **`STATE.md`**.

The app is in **`apps/web/`**, not the repo root. Its `AGENTS.md` applies: this Next.js
version differs from training data — read `node_modules/next/dist/docs/` before
writing framework code.

## Commands (from `apps/web/`)

    npm run typecheck && npm run lint && npm test && npm run build

Integration suites self-skip unless `TEST_DATABASE_URL` is set. CI sets it and
`src/lib/db/__tests__/ci-database.test.ts` fails the run if the wiring is wrong — a
green local run without a database proves unit tests only.

## Deploy

**Merge to `main` = deploy** (`.github/workflows/ci.yml`: verify → image to GHCR →
deploy). PRs run verify only. The server never builds; it pulls the CI image.

- **Never build on the server, and never re-add a `build:` directive** to the server's
  compose file. A server-side build once reverted six weeks of production from a stale
  tree while the site looked healthy.
- Don't pin an image digest in the server compose file — CI re-tags the mutable local tag.
- Verify a deploy inside the running container (`grep` for a new symbol, paired with a
  control term) rather than trusting a green CI.

## Migrations

CI runs `prisma migrate deploy` from the **new** image **before** swapping the container
(since #91), while the old code is still serving. If the post-swap health check fails,
the **image** rolls back but the **schema stays migrated**. So:

- **Migrations must be pure expand** — new tables and nullable columns only; nothing an
  older build reads is altered or dropped. Contract in a later release.
- A failed migration aborts the deploy with the old container untouched.
- **Enum values are irreversible** — Postgres cannot drop one. The enum's order and the
  order roles are offered in (`src/lib/badges/tags.ts`) are deliberately independent.

## Times

Event times are stored as **venue wall-clock** and converted on read. Check the
machine's timezone before blaming or exonerating a change to times or `.ics` output.

## Badge printing

ZPL II, 60 × 40 mm at 203 dpi = 480 × 320 dots (`src/lib/checkin/badge-zpl.ts`). The
Xprinter XP-365B needs TSPL rendered as images (`badge-tspl.ts`). Past failures were
transport, not the generator:

- macOS has no raw queues; the driver rasterises ZPL. Shell: `lpr -l`, **never `lp`**.
  QZ Tray: the options object must be **`{ altPrinting: true }` alone** —
  `qz.configs.create()` defaults make QZ fall back to a rasterising print job.
- "Sent" never means "printed": `lpr` exit 0 and QZ "Printing complete" only mean
  accepted. A CUPS queue is pinned to one printer's USB serial.
- QR quiet zone: at least 4 modules, use 7, measured from any text or black band. Dense
  vCards (~390 bytes) cap at mag 3 on this stock.
- The badge QR URL is **uppercase on purpose** (QR alphanumeric mode); `redirects()` in
  `next.config.ts` makes it resolve despite case-sensitive paths and `localePrefix:
  "always"`. Before printing anything at scale, `curl` the **exact printed string**
  against production.

## Attendee accounts

Registrations can be linked to accounts (#96–#104). A link writes
`attendee_orders.userId` only and always goes through the **merge ledger**
(`src/lib/merge/`), which operators can reverse. Verifying an email claims every
**unowned** registration under it (`claim-on-verify.ts`); that guard lives inside the
transaction — keep it there. The merge notice is email-only (SMS/WhatsApp in
`lib/notify/` are stubs), so the ledger is load-bearing: never ship a claim path without it.

The signed-in `/profile` verification route is exempt from the shared per-address mail
ceiling because it takes the address from the session. Don't fold it back into the public
budget, and don't reintroduce a null-`flowHash` fallback for verification codes.

## Locale

English only (`src/lib/i18n/dir.ts`). Arabic was retired; the README's en/ar mentions are historical.

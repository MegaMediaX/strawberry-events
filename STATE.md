# State — 2026-09-27

LEBTECH 2026 (28–30 Aug) ran on this platform. Work since then is hardening, attendee
accounts and a visual redesign. `main` is at #123; the last 8 CI runs are green; no open PRs or issues.

## Shipped since the event

| When | PRs | What |
|---|---|---|
| 08-25 → 08-27 | #78–#87 | Door UX (walk-in button, network-drop recovery, camera hints), badge job title, new roles: moderator, investor/startup/government, strawberry, free-text "other" |
| 09-03 → 09-04 | #88–#95 | Security: public-register mass assignment, attendee-view secret leak, signup enumeration, magic-link secret, client IP for order lookup; ticket routes converged |
| 09-04 | #91 | **CI migrates before the swap** and runs the DB-backed suites (see CLAUDE.md → Migrations) |
| 09-05 → 09-07 | #96–#104 | **Attendee accounts**: email verification at signup, merge ledger + operator screens, claim from ticket link, forward link, `/profile` verification, verified email claims unowned registrations |
| 09-14 → 09-16 | #105–#111 | Two UI/UX reviews (34 findings), door panel DOM tests, external-audit fixes, a11y conformance pass |
| 09-16 → 09-17 | #112–#116 | "Cinematic" redesign stages 1–4 (index, event, ticket, motion); CI asserts its DB wiring (#116) |
| 09-21 → 09-26 | #117–#123 | "Paper" redesign (ticket, forms, listing), `@layer` fix, OS-following theme, full event posters, red reserved for actions |

Latest migration: `20260917070000_event_cover_focus_and_size` (47 in total).

## Known stale docs

- `README.md` still says "Status: Milestone 1 (Foundation) complete", lists en/ar RTL
  (Arabic is retired), and describes nginx + a cookie-only theme (theme now follows the
  OS on first visit, #121). Architecture and milestone sections are historical.
- `CLAUDE_CODE_STRAWBERRY_PRETIX_REBUILD_PROMPT_V2.md` (2,058 lines) and
  `docs/superpowers/` are the June build brief and plans — reference only.
- `docs/audits/event-day-checklist.md` is pre-event.

## Open items

1. Refresh `README.md` status/stack to match the above.
2. Archive purge (`cleanup()`) and webhook retry (`retryDue()`) are still admin-invoked;
   nothing schedules them.
3. Rate limiting is in-memory, single instance.
4. SMS/WhatsApp notifiers are stubs; the admin UI calls them "providers".
5. Update `docs/audits/event-day-checklist.md` before the next event.

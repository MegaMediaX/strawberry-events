# State — 2026-09-28

LEBTECH 2026 (28–30 Aug) ran on this platform. Work since then is hardening, attendee
accounts and a visual redesign. `main` is at #126; recent CI runs are green.

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
| 09-28 | #125–#127 | **Ended events stop selling**: moved to "Past events", event page shows Ended, register page redirects and the public action refuses. Card focus ring restored (`outline-none` beat `paper-focus` across layers). Closed controls ruled, not red. Public footer (organiser, contact, privacy, terms); `/` and `/en` redirect straight to `/en/events`; test suite green on Node 26 |

Latest migration: `20260917070000_event_cover_focus_and_size` (47 in total).

## Known stale docs

- `README.md` milestone sections are the original build record, not current behaviour.
- `CLAUDE_CODE_STRAWBERRY_PRETIX_REBUILD_PROMPT_V2.md` (2,058 lines) and
  `docs/superpowers/` are the June build brief and plans — reference only.
- `docs/audits/event-day-checklist.md` is pre-event.

## Open items

1. Archive purge (`cleanup()`) and webhook retry (`retryDue()`) are still admin-invoked;
   nothing schedules them.
2. Rate limiting is in-memory, single instance.
3. SMS/WhatsApp notifiers are stubs; the admin UI calls them "providers".
4. Update `docs/audits/event-day-checklist.md` before the next event.
5. Posters, when the next event is featured: the featured plate letterboxes a cover
   into 16/9 when `coverWidth`/`coverHeight` are null (covers uploaded before sizes
   were recorded — LEBTECH's is 1536×1024), and covers are served full-size with no
   `srcset` (~400 KB to a phone). Re-upload or backfill the dimensions; consider
   `next/image` for covers.
6. "Sign in" in the nav is 40px tall on mobile (44px target).

# Event-Day Operations Checklist — Strawberry Events

Companion to `full-production-audit.md`. Print this and keep it at the registration/check-in desks. Times are suggestions — adjust to your event.

> ⚠️ **Before using this for a real public event, clear the audit's CRITICAL items** (env secrets hardened, TLS in place, credentials rotated) and the event-day HIGH items (H1 ticket-revocation guard, H2 seat integrity, H3 events RBAC, H4 webhook secret). See `full-production-audit.md` §3–§4.

---

## 1. Pre-Event (T-7 days → T-1 day)

**Infrastructure**
- [ ] Production deploy is behind **TLS** (Cloudflare full-strict or nginx 443). Verify `https://` loads and HTTP redirects.
- [ ] All secrets set to strong values (no `change_me`/`ChangeMe!123`/`password`/`dev-secret`): `AUTH_SECRET`, `ENCRYPTION_KEY`, `MAGIC_LINK_SECRET`, `PRETIX_WEBHOOK_SECRET`, DB password, pretix token.
- [ ] **`ENCRYPTION_KEY` backed up securely off-host** (losing it destroys all stored integration secrets).
- [ ] `DATABASE_URL` points at the **in-network** DB (`postgres-app:5432`), never `localhost:5433`.
- [ ] DB migrations applied (`prisma migrate deploy`) and a **fresh backup taken + restore tested** on a scratch DB.
- [ ] First **super-admin** account created and login confirmed (verify the seed path actually works in the prod image).
- [ ] SMTP configured and a **real test email received** (in prod, unconfigured SMTP silently no-ops — don't assume).
- [ ] Health check responding; an external uptime monitor is watching it.
- [ ] Docker stack healthy: `docker compose ps` all `healthy`; pretix reachable.

**Event setup (per event)**
- [ ] Event created; correct organizer/org mapping; date/time/location correct.
- [ ] Tickets + quotas created in pretix; prices correct; role-tag → item mapping (`itemTagMap`) set for badges (MEDIA/PARTNER/STAFF/VISITOR/SPEAKER).
- [ ] Approval mode set as intended (`none`/`manual`/`automatic`); auto-approve items configured; **confirm approve-first-then-pay is the behaviour you want** (`payBeforeApproval` is not implemented).
- [ ] If **seated**: seat map present; `accessible`/`blocked` seats marked; **test a real seat booking end-to-end** (hold → confirm → appears reserved) — seated events have known integrity caveats (audit H2).
- [ ] If using **waitlist**: `waitlistEnabled` on; test join shows a position; know that **promotion is manual** (no auto-promote).
- [ ] Visibility correct: public events visible at `/en/events`; private/hidden/coming-soon behave as expected.
- [ ] **Arabic check** (if Arabic attendees): event title/description Arabic fields filled. Note: the public UI chrome is currently English-only (audit H6) — set expectations.

**Access & integrations**
- [ ] Roles assigned: organizer admins, finance, check-in staff (with correct `assignedEventIds`).
- [ ] Check-in staff accounts tested on the actual check-in device/browser.
- [ ] API keys created with least-privilege scopes (raw key copied once, stored in a vault); revoke any unused keys.
- [ ] Webhook endpoints (if any) created, secret rotated, **test delivery received and signature verified**; disable any unused endpoints.
- [ ] pretix check-in list exists for the event (auto-created or via `createCheckinList`).

---

## 2. Registration Desk

- [ ] Public registration page loads on the desk device; test a **free**, a **COD**, and (if used) an **approval-required** registration.
- [ ] Confirm: free → QR issued immediately; COD → "payment pending" (no QR); approval → "under review" (no QR).
- [ ] Required fields enforced (first/last name, email, phone; company optional).
- [ ] Attendee receives confirmation email / can open the magic-link ticket page.
- [ ] `/my-tickets` shows the correct state per registration.
- [ ] Know the rate limit: **10 registrations/minute per IP** — a shared desk NAT can hit this; have a fallback (admin-created order) if a queue forms.
- [ ] Walk-ins: **not implemented** — handle via admin event/registration creation if needed.

---

## 3. Check-in Desk

- [ ] `/staff/checkin` loads; correct event selected; check-in list selected.
- [ ] Search works by QR/code, name, email, phone.
- [ ] Attendee card shows tag, approval state, payment state, issued state.
- [ ] **Eligibility:** only `issued` (paid + approved) checks in. Pending-payment, pending-approval, rejected, canceled are blocked with a clear reason — confirm with a deliberate test of each.
- [ ] Duplicate scan is handled (idempotent "already checked in").
- [ ] Live counter increments.
- [ ] Wrong-event / wrong-org / unassigned-staff attempts are blocked.
- [ ] **COD-at-door:** if someone pays cash at the door, **Finance marks the order paid** (turns COD → issued) before check-in — check-in staff cannot mark paid.

---

## 4. Badge Printer Desk

- [ ] 4×6 thermal printer configured; print a **test badge** and confirm size, tag color, name, company, QR all fit.
- [ ] Auto-print fires after a successful check-in (or the toggle is set as intended).
- [ ] **Reprint** works inline (note: reprints are currently **not logged/audited** — track manually if needed; audit Med).
- [ ] Long names / Arabic names: spot-check they don't overflow the badge (known layout caveat).
- [ ] Badges only print for **issued** attendees (never pending/rejected).
- [ ] QR on badge scans in pretixSCAN if you use it alongside the custom station.
- [ ] Spare paper/labels and a backup printer on hand.

---

## 5. Incident Response (event day)

| Symptom | First action |
|---|---|
| Site down / 502 | `docker compose ps`; check web + nginx health; `docker compose logs --tail=100 next-app`; restart the unhealthy service. |
| Login broken | Confirm TLS is up (Secure cookies need HTTPS); check `AUTH_SECRET` set; check DB reachable. |
| "Too many attempts" at registration | IP rate limit (10/min) — if a shared NAT, register via admin or wait 60s. Login limit is 5/5min per email. |
| QR won't scan / check-in fails | Verify the order is **issued** (paid + approved); for COD, Finance mark-paid first; check the right event/check-in list is selected. |
| Seat double-booked / seat stuck reserved | Known seat-integrity caveat (audit H2): verify in DB (`seat_assignments`), manually release if needed; prefer GA fallback for contested seats. |
| Email not arriving | SMTP may be unconfigured (fails silently); attendee can still use `/my-tickets` / magic link. Re-send manually if needed. |
| pretix unreachable | Check-in redeem + order creation depend on pretix — check `pretix` container health; registrations will error until restored. |
| Webhook subscriber down | Non-blocking by design; deliveries retry. Disable the endpoint if it's adding latency. |
| Suspected bad data / accidental cancel | Use the **archive/delete queue** (soft, 14-day, restorable) — never hard-delete; do not delete pretix orders directly. |
| Need to revoke access | Revoke the relevant API key; disable the webhook; suspend the org/user as appropriate. **Do not** reject an already-issued order to "cancel" it (known bug H1 — revokes the live ticket; fix lands before event). |

**Escalation:** keep the on-call engineer's number, the VPS/Cloudflare login, and the pretix admin URL at the desk.

---

## 6. Post-Event

- [ ] Export attendee/check-in data (via `/api/v1/events/:id/attendees` + `/checkins`, or admin views).
- [ ] Reconcile COD cash collected vs orders marked paid (Finance).
- [ ] Review the **audit log** for the event (approvals, mark-paid, check-ins, key/webhook changes).
- [ ] Take a **final DB backup** and copy it **off-host**; confirm it restores.
- [ ] Archive (not delete) any test/duplicate records via the delete queue.
- [ ] Rotate any API keys/webhook secrets that were shared with temporary staff/vendors.
- [ ] Capture operational friction notes for the next event (feed back into this checklist).
- [ ] If `cleanup()` / waitlist promotion were run manually, note it (no scheduler yet).

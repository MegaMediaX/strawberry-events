-- Revocation controls for attendee magic-link (ticket) tokens.
--
-- A leaked or forwarded ticket email used to grant permanent access to the
-- order and its QR, with no way to kill the link short of cancelling the
-- registration. These two columns are that kill switch.
--
-- Backfill safety: every existing row holds a legacy two-part token that
-- carries no version claim, and those decode as version 0 — exactly the default
-- below. So each link already sitting in an attendee's inbox keeps working
-- after this migration, and no row needs an UPDATE. A leaked link is killed
-- afterwards by bumping "magicLinkVersion" (rotate) or stamping
-- "magicLinkRevokedAt" (hard revoke), per order.
ALTER TABLE "attendee_orders"
  ADD COLUMN "magicLinkVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "magicLinkRevokedAt" TIMESTAMP(3);

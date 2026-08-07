-- Consent provenance on attendee orders (GDPR record integrity).
--
-- consentAt used to be stamped unconditionally by register(), including for the
-- two server-side paths that hardcoded the consent flags (the external API and
-- staff walk-ins). Those rows asserted that a data subject had consented when
-- nobody had asked them. consentSource records the channel that actually
-- produced the consent, and consentAt is now only stamped when the caller on
-- that channel attested it.
CREATE TYPE "ConsentSource" AS ENUM ('web_form', 'staff_walkin', 'api');

-- Backfill is intentionally the column DEFAULT: every pre-existing row was
-- created by the public registration wizard, which hard-requires both consent
-- checkboxes, so 'web_form' is the truthful value for all of them. Adding a
-- column never touches consentAt, so existing timestamps are preserved as-is.
ALTER TABLE "attendee_orders"
  ADD COLUMN "consentSource" "ConsentSource" NOT NULL DEFAULT 'web_form';

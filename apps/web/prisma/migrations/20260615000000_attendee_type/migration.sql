-- Attendee-type registration field (Feature B).
-- Per-event enable/require flags on the event mapping, plus the stored choice
-- on the attendee order. The existing attendee_orders.company column holds the
-- free-text company name when attendeeType = 'company'.
ALTER TABLE "event_mappings" ADD COLUMN "attendeeTypeEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "event_mappings" ADD COLUMN "attendeeTypeRequired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "attendee_orders" ADD COLUMN "attendeeType" TEXT;

-- Integrity guards (the app already enforces these; the constraints stop direct
-- SQL / future code paths from writing contradictory rows). NULLs are allowed.
ALTER TABLE "attendee_orders"
  ADD CONSTRAINT "attendee_orders_attendeeType_check"
  CHECK ("attendeeType" IN ('student', 'company', 'freelancer'));

-- "Required" only valid when the field is also enabled.
ALTER TABLE "event_mappings"
  ADD CONSTRAINT "event_mappings_attendeeType_flags_check"
  CHECK (NOT "attendeeTypeRequired" OR "attendeeTypeEnabled");

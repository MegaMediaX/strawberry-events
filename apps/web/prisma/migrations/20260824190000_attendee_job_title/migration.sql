-- Job title, captured under the company name at registration.
--
-- Nullable with no default and no backfill: the 1,154 registrations taken
-- before this column existed were never asked, and inventing a value for them
-- would put a title on a badge the attendee never gave.
ALTER TABLE "attendee_orders" ADD COLUMN "jobTitle" TEXT;

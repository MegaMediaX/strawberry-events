-- Opt-in session categories (e.g. "Workshops") + per-session abstract.
--
-- requiresOptIn gates a session behind a toggle in the registration Tickets
-- step: the category is hidden in the Sessions step until the attendee ticks
-- it. The gate is evaluated per category (a category is gated when any of its
-- sub-events sets the flag), but stored per row so a session added on the go
-- carries the flag with it.
ALTER TABLE "sub_events"
  ADD COLUMN "descriptionEn" TEXT,
  ADD COLUMN "descriptionAr" TEXT,
  ADD COLUMN "requiresOptIn" BOOLEAN NOT NULL DEFAULT false;

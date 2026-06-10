-- Add liveOnPretix mirror of the pretix `live` flag.
ALTER TABLE "event_mappings" ADD COLUMN "liveOnPretix" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: treat currently-public events as live so the storefront does not go
-- dark on deploy. updateEvent (authoritative) and the inbound pretix webhook keep
-- this in sync going forward.
UPDATE "event_mappings" SET "liveOnPretix" = true WHERE "visibility" = 'public';

-- Pure expand: two defaulted columns and two nullable ones, no backfill,
-- nothing altered. Safe under a health-check rollback, which can leave the
-- previous image running on this schema — that image simply never reads them,
-- and the defaults reproduce exactly what it already does.

-- Every public surface crops the cover to the house cinematic ratio, and it
-- cropped from the CENTRE, unconditionally. A poster whose subject sits high
-- or low lost the subject, and nobody could do anything about it: the crop was
-- a property of the code, not a decision anyone could make per event.
--
-- coverFocusX / coverFocusY are that decision, as percentages of the image,
-- applied as CSS object-position. 50/50 is centre — what every existing row
-- already gets — so this column adds a choice without changing a pixel until
-- someone makes one.
--
-- coverWidth / coverHeight are the stored file's own intrinsic size, read from
-- its header when it is uploaded. Link previews declare them so a scraper can
-- reserve the right box instead of reflowing. Null means the cover predates
-- this migration; the preview then omits the dimensions exactly as it does
-- today rather than declaring a guess, because a WRONG declared size is worse
-- than none.
ALTER TABLE "event_mappings"
  ADD COLUMN "coverFocusX" INTEGER NOT NULL DEFAULT 50,
  ADD COLUMN "coverFocusY" INTEGER NOT NULL DEFAULT 50,
  ADD COLUMN "coverWidth" INTEGER,
  ADD COLUMN "coverHeight" INTEGER;

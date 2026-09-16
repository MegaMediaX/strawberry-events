-- Pure expand: two nullable columns, no backfill, nothing altered. Safe under a
-- health-check rollback, which can leave the previous image running on this
-- schema — that image simply never writes them.

-- badge_print_logs recorded the DISPATCH of a badge, not its arrival. The row
-- is written server-side the moment a check-in or reprint succeeds, while the
-- print itself happens in the browser seconds later through QZ Tray. So every
-- failed print, every jam, and every "printer unavailable" still left a row
-- saying that user printed that badge — wrong in exactly the cases someone
-- would be reading this table to investigate.
--
-- The row keeps its meaning (a badge was dispatched). These two say what became
-- of it, reported by the door once the print resolves:
--   confirmedAt   — the badge came out of the printer
--   failureReason — it did not, and why
-- Both null means no outcome was ever reported: the tab was closed mid-print,
-- or the door never called back. That is a third state, and it is deliberately
-- distinguishable from the other two rather than folded into "printed".
ALTER TABLE "badge_print_logs"
  ADD COLUMN "confirmedAt" TIMESTAMP(3),
  ADD COLUMN "failureReason" TEXT;

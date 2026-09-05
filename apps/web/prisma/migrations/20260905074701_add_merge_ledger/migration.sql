-- Pure expand: two new tables, their indexes, one foreign key between them.
-- Nothing existing is altered or dropped.
--
-- `prisma migrate diff` again generated DROP INDEX statements for
-- "attendee_orders_attendeeName_trgm" and "attendee_orders_phone_trgm" — the
-- GIN trigram indexes behind typo-tolerant attendee search at the door — and
-- they have again been removed by hand. This is the SECOND migration in a row
-- to carry them, which is why there is now a test that fails the build if they
-- ever survive into a committed migration: see
-- src/lib/db/__tests__/migrations.test.ts.
--
-- Cause: Prisma's schema language cannot express `gin_trgm_ops`, so those
-- indexes are invisible to schema.prisma and every diff reads them as drift.

-- CreateTable
CREATE TABLE "account_merge_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorUserId" TEXT,
    "proofType" TEXT NOT NULL,
    "matchRule" TEXT,
    "reason" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reverseDeadline" TIMESTAMP(3) NOT NULL,
    "reversedAt" TIMESTAMP(3),
    "reversedByUserId" TEXT,
    "reversedCount" INTEGER,
    "reversedReason" TEXT,

    CONSTRAINT "account_merge_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_merge_event_entities" (
    "id" TEXT NOT NULL,
    "mergeEventId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "previousUserId" TEXT,

    CONSTRAINT "account_merge_event_entities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "account_merge_events_userId_idx" ON "account_merge_events"("userId");

-- CreateIndex
CREATE INDEX "account_merge_events_createdAt_idx" ON "account_merge_events"("createdAt");

-- CreateIndex
CREATE INDEX "account_merge_events_reversedAt_reverseDeadline_idx" ON "account_merge_events"("reversedAt", "reverseDeadline");

-- CreateIndex
CREATE INDEX "account_merge_event_entities_entityId_idx" ON "account_merge_event_entities"("entityId");

-- CreateIndex
CREATE UNIQUE INDEX "account_merge_event_entities_mergeEventId_entityType_entity_key" ON "account_merge_event_entities"("mergeEventId", "entityType", "entityId");

-- AddForeignKey
ALTER TABLE "account_merge_event_entities" ADD CONSTRAINT "account_merge_event_entities_mergeEventId_fkey" FOREIGN KEY ("mergeEventId") REFERENCES "account_merge_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Value constraints. NOT enums: Postgres cannot drop an enum value, and both
-- of these columns gain values as the claim paths land, so a widenable and
-- narrowable CHECK is the right shape.
ALTER TABLE "account_merge_events"
  ADD CONSTRAINT "account_merge_events_actorType_check"
  CHECK ("actorType" IN ('self_claim', 'staff_override'));

ALTER TABLE "account_merge_events"
  ADD CONSTRAINT "account_merge_events_proofType_check"
  CHECK ("proofType" IN ('admin_override', 'magic_link', 'email_code', 'phone_code'));

-- An operator action must always carry both an operator and a stated reason.
-- Enforced here rather than only in the application, because the whole point of
-- this table is to be trustworthy when someone disputes what happened.
ALTER TABLE "account_merge_events"
  ADD CONSTRAINT "account_merge_events_staff_accountable_check"
  CHECK (
    "actorType" <> 'staff_override'
    OR ("actorUserId" IS NOT NULL AND "reason" IS NOT NULL AND btrim("reason") <> '')
  );

ALTER TABLE "account_merge_event_entities"
  ADD CONSTRAINT "account_merge_event_entities_entityType_check"
  CHECK ("entityType" IN ('attendee_order', 'waitlist_entry'));

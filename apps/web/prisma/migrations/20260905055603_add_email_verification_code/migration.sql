-- Pure expand: one new table, two indexes, one foreign key. Nothing existing
-- is altered or dropped.
--
-- `prisma migrate diff` generated two DROP INDEX statements above this table
-- and they have been removed by hand. They targeted
-- "attendee_orders_attendeeName_trgm" and "attendee_orders_phone_trgm" — the
-- GIN trigram indexes created in 20260612000000_add_trgm_fuzzy_search, which
-- are what keep typo-tolerant attendee search fast at the door.
--
-- Prisma's schema language cannot express `gin_trgm_ops`, so those indexes are
-- invisible to schema.prisma and EVERY generated diff will read them as drift
-- and propose dropping them again. Check the top of any future generated
-- migration for exactly this, and delete it.
--
-- Dropping them does not fail, and does not show up in a migration that
-- "applies cleanly" — search simply gets slow later, with nothing pointing back
-- to here.

-- CreateTable
CREATE TABLE "email_verification_codes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "supersededAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_verification_codes_email_idx" ON "email_verification_codes"("email");

-- CreateIndex
CREATE INDEX "email_verification_codes_expiresAt_idx" ON "email_verification_codes"("expiresAt");

-- AddForeignKey
ALTER TABLE "email_verification_codes" ADD CONSTRAINT "email_verification_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- CreateEnum
CREATE TYPE "WaitlistStatus" AS ENUM ('waiting', 'promoted', 'converted', 'canceled');

-- AlterTable
ALTER TABLE "event_mappings" ADD COLUMN     "seatSelectionEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "waitlistEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "waitlist_entries" (
    "id" TEXT NOT NULL,
    "eventMappingId" TEXT NOT NULL,
    "itemId" INTEGER,
    "email" TEXT NOT NULL,
    "userId" TEXT,
    "position" INTEGER NOT NULL,
    "status" "WaitlistStatus" NOT NULL DEFAULT 'waiting',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "promotedAt" TIMESTAMP(3),

    CONSTRAINT "waitlist_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "waitlist_entries_eventMappingId_status_idx" ON "waitlist_entries"("eventMappingId", "status");

-- CreateIndex
CREATE INDEX "waitlist_entries_email_idx" ON "waitlist_entries"("email");

-- AddForeignKey
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_eventMappingId_fkey" FOREIGN KEY ("eventMappingId") REFERENCES "event_mappings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

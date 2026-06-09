-- CreateEnum
CREATE TYPE "ArchiveStatus" AS ENUM ('queued', 'restored', 'purged', 'canceled');

-- AlterTable
ALTER TABLE "archive_queue" ADD COLUMN     "canceledAt" TIMESTAMP(3),
ADD COLUMN     "eventMappingId" TEXT,
ADD COLUMN     "organizationId" TEXT,
ADD COLUMN     "reason" TEXT,
ADD COLUMN     "requestedByUserId" TEXT,
ADD COLUMN     "restoredAt" TIMESTAMP(3),
ADD COLUMN     "status" "ArchiveStatus" NOT NULL DEFAULT 'queued',
ADD COLUMN     "targetName" TEXT;

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "impersonatedUserId" TEXT,
ADD COLUMN     "success" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "integration_settings" ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "lastTestedAt" TIMESTAMP(3),
ADD COLUMN     "updatedByUserId" TEXT;

-- AlterTable
ALTER TABLE "smtp_settings" ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "lastTestedAt" TIMESTAMP(3),
ADD COLUMN     "replyTo" TEXT,
ADD COLUMN     "updatedByUserId" TEXT;

-- CreateTable
CREATE TABLE "reminder_settings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventMappingId" TEXT,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "whatsappEnabled" BOOLEAN NOT NULL DEFAULT false,
    "smsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "offsetsMinutes" INTEGER[] DEFAULT ARRAY[1440, 60]::INTEGER[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reminder_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reminder_settings_organizationId_eventMappingId_key" ON "reminder_settings"("organizationId", "eventMappingId");

-- CreateIndex
CREATE INDEX "archive_queue_organizationId_status_idx" ON "archive_queue"("organizationId", "status");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

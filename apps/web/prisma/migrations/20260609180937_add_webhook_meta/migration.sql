-- AlterTable
ALTER TABLE "webhook_deliveries" ADD COLUMN     "error" TEXT,
ADD COLUMN     "nextRetryAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "webhooks" ADD COLUMN     "createdByUserId" TEXT,
ADD COLUMN     "eventId" TEXT;

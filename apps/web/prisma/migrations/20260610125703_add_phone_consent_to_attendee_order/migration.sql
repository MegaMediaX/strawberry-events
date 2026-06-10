-- AlterTable
ALTER TABLE "attendee_orders" ADD COLUMN     "consentAt" TIMESTAMP(3),
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "phoneCC" TEXT;

-- AlterTable
ALTER TABLE "event_mappings" ADD COLUMN     "address" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "mapEmbedUrl" TEXT,
ADD COLUMN     "mapUrl" TEXT,
ADD COLUMN     "venueName" TEXT;

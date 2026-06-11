-- AlterTable: add sub-event capacity controls to event_mappings
ALTER TABLE "event_mappings"
  ADD COLUMN "maxAttendees"        INTEGER,
  ADD COLUMN "ticketsPerUserMain"  INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "ticketsPerUserTotal" INTEGER NOT NULL DEFAULT 1;

-- CreateTable: sub_events
CREATE TABLE "sub_events" (
    "id"             TEXT NOT NULL,
    "eventMappingId" TEXT NOT NULL,
    "titleEn"        TEXT NOT NULL,
    "titleAr"        TEXT,
    "category"       TEXT NOT NULL,
    "location"       TEXT,
    "dateFrom"       TIMESTAMP(3) NOT NULL,
    "dateTo"         TIMESTAMP(3) NOT NULL,
    "priceCents"     INTEGER NOT NULL DEFAULT 0,
    "maxAttendees"   INTEGER,
    "ticketsPerUser" INTEGER NOT NULL DEFAULT 1,
    "pretixItemId"   INTEGER,
    "pretixQuotaId"  INTEGER,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sub_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sub_events_eventMappingId_idx" ON "sub_events"("eventMappingId");

-- AddForeignKey
ALTER TABLE "sub_events" ADD CONSTRAINT "sub_events_eventMappingId_fkey"
    FOREIGN KEY ("eventMappingId") REFERENCES "event_mappings"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

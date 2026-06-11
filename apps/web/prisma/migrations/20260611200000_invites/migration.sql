-- CreateTable: invites (email-bound, single-use invite records)
CREATE TABLE "invites" (
    "id"                 TEXT NOT NULL,
    "eventMappingId"     TEXT NOT NULL,
    "email"              TEXT NOT NULL,
    "itemIds"            INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
    "tag"                "AttendeeTag",
    "tokenHash"          TEXT NOT NULL,
    "expiresAt"          TIMESTAMP(3),
    "redeemedAt"         TIMESTAMP(3),
    "redeemedOrderCode"  TEXT,
    "createdByUserId"    TEXT,
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invites_tokenHash_key" ON "invites"("tokenHash");
CREATE INDEX "invites_eventMappingId_idx" ON "invites"("eventMappingId");
CREATE INDEX "invites_email_idx" ON "invites"("email");

-- AddForeignKey
ALTER TABLE "invites" ADD CONSTRAINT "invites_eventMappingId_fkey"
    FOREIGN KEY ("eventMappingId") REFERENCES "event_mappings"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

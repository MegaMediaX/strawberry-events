-- Typo-tolerant attendee search (e.g. "mohamad" should match "mouhamad").
-- Requires the pg_trgm extension; the VPS Postgres runs as a superuser role so
-- CREATE EXTENSION succeeds at migrate time.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN trigram indexes keep similarity()/word_similarity() and ILIKE '%..%'
-- searches fast as the attendee list grows.
CREATE INDEX IF NOT EXISTS "attendee_orders_attendeeName_trgm"
  ON "attendee_orders" USING gin ("attendeeName" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "attendee_orders_phone_trgm"
  ON "attendee_orders" USING gin ("phone" gin_trgm_ops);

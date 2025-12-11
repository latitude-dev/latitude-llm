ALTER TABLE "latitude"."spans"
DROP COLUMN IF EXISTS "previous_span_id";

ALTER TABLE "latitude"."spans"
ADD COLUMN "previous_trace_id" varchar(32);


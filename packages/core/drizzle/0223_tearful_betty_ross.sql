COMMIT;
--> statement-breakpoint

BEGIN;
ALTER TABLE "latitude"."evaluation_results_v2" ADD COLUMN "evaluated_span_id" varchar(16);--> statement-breakpoint
ALTER TABLE "latitude"."evaluation_results_v2" ADD COLUMN "evaluated_trace_id" varchar(32);--> statement-breakpoint
CREATE INDEX CONCURRENTLY "evaluation_results_v2_span_trace_idx" ON "latitude"."evaluation_results_v2" USING btree ("evaluated_span_id","evaluated_trace_id");
COMMIT;

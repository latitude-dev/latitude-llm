BEGIN;
ALTER TABLE "latitude"."evaluation_results_v2" ALTER COLUMN "evaluated_log_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."evaluation_results_v2" ADD COLUMN "evaluated_span_id" varchar(16);--> statement-breakpoint
ALTER TABLE "latitude"."evaluation_results_v2" ADD COLUMN "evaluated_trace_id" varchar(32);--> statement-breakpoint
COMMIT;
--> statement-breakpoint

BEGIN;
ALTER TABLE "latitude"."spans" ADD COLUMN "source" varchar(32);--> statement-breakpoint
ALTER TABLE "latitude"."spans" ADD COLUMN "model" varchar(32);--> statement-breakpoint
COMMIT;
--> statement-breakpoint

CREATE INDEX CONCURRENTLY "evaluation_results_v2_evaluated_span_id_idx" ON "latitude"."evaluation_results_v2" USING btree ("evaluated_span_id","evaluated_trace_id");--> statement-breakpoint
CREATE UNIQUE INDEX CONCURRENTLY "evaluation_results_v2_unique_evaluated_span_id_evaluation_uuid_idx" ON "latitude"."evaluation_results_v2" USING btree ("evaluated_span_id","evaluated_trace_id","evaluation_uuid");

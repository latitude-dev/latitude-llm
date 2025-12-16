ALTER TYPE "latitude"."log_source" ADD VALUE 'external';--> statement-breakpoint
ALTER TABLE "latitude"."spans" ADD COLUMN "previous_trace_id" varchar(32);--> statement-breakpoint
CREATE INDEX "spans_previous_trace_id_idx" ON "latitude"."spans" USING btree ("previous_trace_id");
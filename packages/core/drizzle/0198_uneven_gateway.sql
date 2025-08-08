ALTER TABLE "latitude"."segments" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "latitude"."segments" CASCADE;--> statement-breakpoint
DROP INDEX "latitude"."spans_segment_id_idx";--> statement-breakpoint
DROP INDEX "latitude"."spans_trace_id_segment_id_idx";--> statement-breakpoint
ALTER TABLE "latitude"."spans" ADD COLUMN "document_log_uuid" uuid;--> statement-breakpoint
CREATE INDEX "spans_document_log_uuid_idx" ON "latitude"."spans" USING btree ("document_log_uuid");--> statement-breakpoint
ALTER TABLE "latitude"."spans" DROP COLUMN "segment_id";
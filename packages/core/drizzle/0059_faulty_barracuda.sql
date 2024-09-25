ALTER TABLE "latitude"."document_logs" ADD COLUMN "source" "latitude"."log_source";--> statement-breakpoint
ALTER TABLE "latitude"."evaluation_results" ADD COLUMN "source" "latitude"."log_source";
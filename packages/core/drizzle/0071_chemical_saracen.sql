ALTER TABLE "latitude"."run_errors" ALTER COLUMN "errorable_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."evaluation_results" ALTER COLUMN "uuid" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."run_errors" ADD COLUMN "errorable_uuid" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."provider_logs" ADD COLUMN "finish_reason" varchar DEFAULT 'stop' NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "run_errors_errorable_entity_uuid_idx" ON "latitude"."run_errors" USING btree ("errorable_uuid","errorable_type");
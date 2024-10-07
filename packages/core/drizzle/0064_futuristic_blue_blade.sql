ALTER TYPE "latitude"."run_error_code_enum" ADD VALUE 'unsupported_provider_response_type_error';--> statement-breakpoint
ALTER TYPE "latitude"."run_error_code_enum" ADD VALUE 'ai_provider_config_error';--> statement-breakpoint
ALTER TABLE "latitude"."run_errors" DROP CONSTRAINT "run_errors_provider_log_id_provider_logs_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "run_errors_provider_log_idx";--> statement-breakpoint
ALTER TABLE "latitude"."run_errors" ALTER COLUMN "errorable_type" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."run_errors" ALTER COLUMN "errorable_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."run_errors" DROP COLUMN IF EXISTS "provider_log_id";
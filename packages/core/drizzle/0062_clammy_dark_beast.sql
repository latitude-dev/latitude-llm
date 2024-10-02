DO $$ BEGIN
 CREATE TYPE "latitude"."run_error_code_enum" AS ENUM('unknown_error', 'default_provider_exceeded_quota_error', 'document_config_error', 'missing_provider_error', 'chain_compile_error', 'ai_run_error');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "latitude"."run_error_entity_enum" AS ENUM('document_log', 'evaluation_result');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "latitude"."run_errors" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"code" "latitude"."run_error_code_enum" NOT NULL,
	"errorable_type" "latitude"."run_error_entity_enum",
	"errorable_id" bigint,
	"provider_log_id" bigint,
	"message" text NOT NULL,
	"details" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "latitude"."evaluation_results" ALTER COLUMN "resultable_type" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."evaluation_results" ALTER COLUMN "resultable_id" DROP NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."run_errors" ADD CONSTRAINT "run_errors_provider_log_id_provider_logs_id_fk" FOREIGN KEY ("provider_log_id") REFERENCES "latitude"."provider_logs"("id") ON DELETE set null ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "run_errors_provider_log_idx" ON "latitude"."run_errors" USING btree ("provider_log_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "run_errors_errorable_entity_idx" ON "latitude"."run_errors" USING btree ("errorable_id","errorable_type");
-- Missing migration
ALTER TABLE "latitude"."document_logs" ALTER COLUMN "source" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "latitude"."provider_logs" ALTER COLUMN "source" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "latitude"."evaluation_results" ALTER COLUMN "source" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "latitude"."log_source";--> statement-breakpoint
CREATE TYPE "latitude"."log_source" AS ENUM('api', 'agent_as_tool', 'copilot', 'email_trigger', 'evaluation', 'experiment', 'integration_trigger', 'playground', 'scheduled_trigger', 'shared_prompt', 'shadow_test', 'ab_test_challenger', 'user');--> statement-breakpoint
ALTER TABLE "latitude"."document_logs" ALTER COLUMN "source" SET DATA TYPE "latitude"."log_source" USING "source"::"latitude"."log_source";--> statement-breakpoint
ALTER TABLE "latitude"."provider_logs" ALTER COLUMN "source" SET DATA TYPE "latitude"."log_source" USING "source"::"latitude"."log_source";--> statement-breakpoint
ALTER TABLE "latitude"."evaluation_results" ALTER COLUMN "source" SET DATA TYPE "latitude"."log_source" USING "source"::"latitude"."log_source";--> statement-breakpoint

-- Fixed migration
ALTER TABLE "latitude"."evaluation_versions" DROP COLUMN IF EXISTS "alignment_metric";
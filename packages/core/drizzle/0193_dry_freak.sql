ALTER TYPE "latitude"."run_error_code_enum" ADD VALUE 'error_generating_mock_tool_result';--> statement-breakpoint
ALTER TABLE "latitude"."evaluation_results" ALTER COLUMN "source" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "latitude"."document_logs" ALTER COLUMN "source" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "latitude"."provider_logs" ALTER COLUMN "source" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "latitude"."log_source";--> statement-breakpoint
CREATE TYPE "latitude"."log_source" AS ENUM('api', 'agent_as_tool', 'copilot', 'email_trigger', 'evaluation', 'experiment', 'playground', 'scheduled_trigger', 'integration_trigger', 'shared_prompt', 'user');--> statement-breakpoint
ALTER TABLE "latitude"."evaluation_results" ALTER COLUMN "source" SET DATA TYPE "latitude"."log_source" USING "source"::"latitude"."log_source";--> statement-breakpoint
ALTER TABLE "latitude"."document_logs" ALTER COLUMN "source" SET DATA TYPE "latitude"."log_source" USING "source"::"latitude"."log_source";--> statement-breakpoint
ALTER TABLE "latitude"."provider_logs" ALTER COLUMN "source" SET DATA TYPE "latitude"."log_source" USING "source"::"latitude"."log_source";

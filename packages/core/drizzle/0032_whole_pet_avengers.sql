ALTER TABLE "latitude"."provider_logs" ALTER COLUMN "response_text" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "latitude"."provider_logs" ALTER COLUMN "tool_calls" SET DEFAULT '[]'::json;--> statement-breakpoint
ALTER TABLE "latitude"."provider_logs" ADD COLUMN "generated_at" timestamp NOT NULL;
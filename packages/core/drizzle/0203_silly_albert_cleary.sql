ALTER TABLE "latitude"."provider_logs" ALTER COLUMN "messages" SET DEFAULT '[]'::json;--> statement-breakpoint
ALTER TABLE "latitude"."provider_logs" ALTER COLUMN "messages" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."provider_logs" ALTER COLUMN "tool_calls" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."provider_logs" ADD COLUMN "file_key" varchar;
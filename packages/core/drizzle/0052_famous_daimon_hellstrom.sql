ALTER TABLE "latitude"."provider_logs" ALTER COLUMN "response_text" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "latitude"."provider_logs" ALTER COLUMN "response_text" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."provider_logs" ADD COLUMN "response_object" jsonb;
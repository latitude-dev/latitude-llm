ALTER TYPE "latitude"."provider" ADD VALUE 'google_vertex';--> statement-breakpoint
ALTER TYPE "latitude"."provider" ADD VALUE 'anthropic_vertex';--> statement-breakpoint
ALTER TABLE "latitude"."provider_api_keys" ADD COLUMN "configuration" jsonb;
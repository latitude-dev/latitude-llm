ALTER TYPE "latitude"."provider" ADD VALUE 'custom';--> statement-breakpoint
ALTER TABLE "latitude"."provider_api_keys" ADD COLUMN "url" varchar;
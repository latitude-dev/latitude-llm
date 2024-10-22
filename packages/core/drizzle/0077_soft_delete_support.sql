ALTER TABLE "latitude"."commits" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "latitude"."provider_api_keys" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "latitude"."evaluations" ADD COLUMN "deleted_at" timestamp;
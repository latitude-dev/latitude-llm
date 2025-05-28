ALTER TABLE "latitude"."exports" DROP CONSTRAINT "exports_token_unique";--> statement-breakpoint
ALTER TABLE "latitude"."exports" DROP COLUMN IF EXISTS "token";
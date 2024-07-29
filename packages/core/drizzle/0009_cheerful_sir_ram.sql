ALTER TABLE "latitude"."providerApiKeys" RENAME COLUMN "uuid" TO "token";--> statement-breakpoint
ALTER TABLE "latitude"."providerApiKeys" ALTER COLUMN "token" SET DATA TYPE varchar;
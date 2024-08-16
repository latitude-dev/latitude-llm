ALTER TABLE "latitude"."provider_logs" RENAME COLUMN "cost" TO "cost_in_millicents";--> statement-breakpoint
ALTER TABLE "latitude"."provider_logs" ALTER COLUMN "cost_in_millicents" SET DEFAULT 0;
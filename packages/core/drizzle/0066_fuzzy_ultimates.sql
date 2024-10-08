ALTER TABLE "latitude"."evaluation_results" ADD COLUMN "uuid" uuid;--> statement-breakpoint
ALTER TABLE "latitude"."evaluation_results" ADD CONSTRAINT "evaluation_results_uuid_unique" UNIQUE("uuid");
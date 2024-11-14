ALTER TYPE "latitude"."metadata_type" ADD VALUE 'default';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "latitude"."evaluation_metadata_default" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "latitude"."evaluation_results" ADD COLUMN "reason" text;
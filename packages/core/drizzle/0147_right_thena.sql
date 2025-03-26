ALTER TABLE "latitude"."datasets_v2" ADD COLUMN "is_golden" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."datasets_v2" DROP COLUMN IF EXISTS "tags";

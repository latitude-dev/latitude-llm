ALTER TABLE "latitude"."connected_evaluations" ADD COLUMN "live" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."connected_evaluations" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "latitude"."connected_evaluations" DROP COLUMN IF EXISTS "evaluation_mode";
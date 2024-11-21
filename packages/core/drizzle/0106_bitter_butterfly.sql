DO $$ BEGIN
 CREATE TYPE "latitude"."span_internal_types" AS ENUM('generation');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "latitude"."spans" ADD COLUMN "model" varchar;--> statement-breakpoint
ALTER TABLE "latitude"."spans" ADD COLUMN "model_parameters" text;--> statement-breakpoint
ALTER TABLE "latitude"."spans" ADD COLUMN "input" text;--> statement-breakpoint
ALTER TABLE "latitude"."spans" ADD COLUMN "output" text;--> statement-breakpoint
ALTER TABLE "latitude"."spans" ADD COLUMN "prompt_tokens" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."spans" ADD COLUMN "completion_tokens" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."spans" ADD COLUMN "total_tokens" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."spans" ADD COLUMN "input_cost_in_millicents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."spans" ADD COLUMN "output_cost_in_millicents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."spans" ADD COLUMN "total_cost_in_millicents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."spans" ADD COLUMN "internal_type" "latitude"."span_internal_types";
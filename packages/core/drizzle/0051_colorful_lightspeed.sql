DO $$ BEGIN
 CREATE TYPE "latitude"."evaluation_result_types" AS ENUM('evaluation_resultable_booleans', 'evaluation_resultable_texts', 'evaluation_resultable_numbers');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "latitude"."evaluation_resultable_numbers" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"result" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "latitude"."evaluation_resultable_texts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"result" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "latitude"."evaluation_resultable_booleans" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"result" boolean NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "latitude"."evaluations" ADD COLUMN "configuration" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."evaluation_results" ADD COLUMN "resultable_type" "evaluation_result_types" NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."evaluation_results" ADD COLUMN "resultable_id" bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."evaluations_templates" ADD COLUMN "configuration" jsonb NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "resultable_idx" ON "latitude"."evaluation_results" USING btree ("resultable_id","resultable_type");--> statement-breakpoint
ALTER TABLE "latitude"."evaluation_results" DROP COLUMN IF EXISTS "result";
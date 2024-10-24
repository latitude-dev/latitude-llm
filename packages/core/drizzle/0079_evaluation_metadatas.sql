--- Migrate configuration column from "evaluations" to "llm_as_judge_evaluation_metadatas"
ALTER TABLE "latitude"."llm_as_judge_evaluation_metadatas" ADD COLUMN "configuration" jsonb;--> statement-breakpoint

UPDATE "latitude"."llm_as_judge_evaluation_metadatas"
SET "configuration" = "latitude"."evaluations"."configuration"
FROM "latitude"."evaluations"
WHERE "latitude"."evaluations"."metadata_id" = "latitude"."llm_as_judge_evaluation_metadatas"."id";--> statement-breakpoint

--- Remove evaluations with NULL configuratios (these are llm_as_judge_evaluation_metadatas rows that are left when removing the original evaluation)
DELETE FROM "latitude"."llm_as_judge_evaluation_metadatas" WHERE "latitude"."llm_as_judge_evaluation_metadatas"."configuration" IS NULL--> statement-breakpoint

ALTER TABLE "latitude"."llm_as_judge_evaluation_metadatas" ALTER COLUMN "configuration" SET NOT NULL;--> statement-breakpoint

--- Remove the now unnecessary columns
ALTER TABLE "latitude"."evaluations" DROP COLUMN IF EXISTS "configuration";--> statement-breakpoint
ALTER TABLE "latitude"."llm_as_judge_evaluation_metadatas" DROP COLUMN IF EXISTS "metadata_type";--> statement-breakpoint

--- Create the rest of evaluation_metadatas
ALTER TYPE "latitude"."metadata_type" ADD VALUE 'llm_as_judge_boolean';--> statement-breakpoint
ALTER TYPE "latitude"."metadata_type" ADD VALUE 'llm_as_judge_numerical';--> statement-breakpoint
ALTER TYPE "latitude"."metadata_type" ADD VALUE 'llm_as_judge_custom';--> statement-breakpoint

DROP TABLE IF EXISTS "latitude"."evaluation_metadata_llm_as_judge_boolean";--> statement-breakpoint
DROP TABLE IF EXISTS "latitude"."evaluation_metadata_llm_as_judge_numerical";--> statement-breakpoint
DROP TABLE IF EXISTS "latitude"."evaluation_metadata_llm_as_judge_custom";--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "latitude"."evaluation_metadata_llm_as_judge_boolean" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"provider_api_key_id" bigint NOT NULL,
	"model" varchar(256) NOT NULL,
	"objective" text NOT NULL,
	"additional_instructions" text,
	"true_result_description" text,
	"false_result_description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "latitude"."evaluation_metadata_llm_as_judge_numerical" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"provider_api_key_id" bigint NOT NULL,
	"model" varchar(256) NOT NULL,
	"objective" text NOT NULL,
	"additional_instructions" text,
	"min_value" bigint NOT NULL,
	"max_value" bigint NOT NULL,
	"min_value_description" text,
	"max_value_description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "latitude"."evaluation_metadata_llm_as_judge_custom" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"provider_api_key_id" bigint NOT NULL,
	"model" varchar(256) NOT NULL,
	"objective" text NOT NULL,
	"additional_instructions" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."evaluation_metadata_llm_as_judge_boolean" ADD CONSTRAINT "evaluation_metadata_llm_as_judge_boolean_provider_api_key_id_provider_api_keys_id_fk" FOREIGN KEY ("provider_api_key_id") REFERENCES "latitude"."provider_api_keys"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."evaluation_metadata_llm_as_judge_numerical" ADD CONSTRAINT "evaluation_metadata_llm_as_judge_numerical_provider_api_key_id_provider_api_keys_id_fk" FOREIGN KEY ("provider_api_key_id") REFERENCES "latitude"."provider_api_keys"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."evaluation_metadata_llm_as_judge_custom" ADD CONSTRAINT "evaluation_metadata_llm_as_judge_custom_provider_api_key_id_provider_api_keys_id_fk" FOREIGN KEY ("provider_api_key_id") REFERENCES "latitude"."provider_api_keys"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evaluation_metadata_llm_as_judge_boolean_provider_api_key_id_idx" ON "latitude"."evaluation_metadata_llm_as_judge_boolean" USING btree ("provider_api_key_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evaluation_metadata_llm_as_judge_numerical_provider_api_key_id_idx" ON "latitude"."evaluation_metadata_llm_as_judge_numerical" USING btree ("provider_api_key_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evaluation_metadata_llm_as_judge_custom_provider_api_key_id_idx" ON "latitude"."evaluation_metadata_llm_as_judge_custom" USING btree ("provider_api_key_id");--> statement-breakpoint

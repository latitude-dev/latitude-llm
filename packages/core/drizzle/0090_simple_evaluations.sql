ALTER TYPE "latitude"."metadata_type" ADD VALUE 'llm_as_judge_simple';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "latitude"."evaluation_metadata_llm_as_judge_simple" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"provider_api_key_id" bigint NOT NULL,
	"model" text NOT NULL,
	"objective" text NOT NULL,
	"additional_instructions" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "latitude"."evaluation_configuration_boolean" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"false_value_description" text,
	"true_value_description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "latitude"."evaluation_configuration_numerical" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"min_value" numeric NOT NULL,
	"max_value" numeric NOT NULL,
	"min_value_description" text,
	"max_value_description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "latitude"."evaluation_configuration_text" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"value_description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "latitude"."evaluations" ADD COLUMN "result_type" "evaluation_result_types";--> statement-breakpoint
ALTER TABLE "latitude"."evaluations" ADD COLUMN "result_configuration_id" bigint;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."evaluation_metadata_llm_as_judge_simple" ADD CONSTRAINT "evaluation_metadata_llm_as_judge_simple_provider_api_key_id_provider_api_keys_id_fk" FOREIGN KEY ("provider_api_key_id") REFERENCES "latitude"."provider_api_keys"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

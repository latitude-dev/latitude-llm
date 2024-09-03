DO $$ BEGIN
 CREATE TYPE "latitude"."metadata_type" AS ENUM('llm_as_judge');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "latitude"."llm_as_judge_evaluation_metadatas" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"metadata_type" varchar(256) DEFAULT 'llm_as_judge' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"prompt" text NOT NULL,
	"template_id" bigint
);
--> statement-breakpoint
ALTER TABLE "latitude"."evaluations" DROP CONSTRAINT "evaluations_template_id_evaluations_templates_id_fk";
--> statement-breakpoint
ALTER TABLE "latitude"."evaluations" ADD COLUMN "metadata_id" bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."evaluations" ADD COLUMN "metadata_type" "latitude"."metadata_type" NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."llm_as_judge_evaluation_metadatas" ADD CONSTRAINT "llm_as_judge_evaluation_metadatas_template_id_evaluations_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "latitude"."evaluations_templates"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "llm_as_judge_evaluation_metadatas_template_id_idx" ON "latitude"."llm_as_judge_evaluation_metadatas" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evaluation_metadata_idx" ON "latitude"."evaluations" USING btree ("metadata_id","metadata_type");--> statement-breakpoint
ALTER TABLE "latitude"."evaluations" DROP COLUMN IF EXISTS "prompt";--> statement-breakpoint
ALTER TABLE "latitude"."evaluations" DROP COLUMN IF EXISTS "template_id";
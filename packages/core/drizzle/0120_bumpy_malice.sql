CREATE TABLE IF NOT EXISTS "latitude"."document_suggestions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"commit_id" bigint NOT NULL,
	"document_uuid" uuid NOT NULL,
	"evaluation_id" bigint NOT NULL,
	"prompt" text NOT NULL,
	"summary" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."document_suggestions" ADD CONSTRAINT "document_suggestions_evaluation_id_evaluations_id_fk" FOREIGN KEY ("evaluation_id") REFERENCES "latitude"."evaluations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."document_suggestions" ADD CONSTRAINT "document_suggestions_document_versions_fk" FOREIGN KEY ("commit_id","document_uuid") REFERENCES "latitude"."document_versions"("commit_id","document_uuid") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_suggestions_commit_id_idx" ON "latitude"."document_suggestions" USING btree ("commit_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_suggestions_document_uuid_idx" ON "latitude"."document_suggestions" USING btree ("document_uuid");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_suggestions_evaluation_id_idx" ON "latitude"."document_suggestions" USING btree ("evaluation_id");
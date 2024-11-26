CREATE TABLE IF NOT EXISTS "latitude"."published_documents" (
	"uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_uuid" uuid NOT NULL,
	"title" varchar,
	"description" text,
	"workspace_id" bigint NOT NULL,
	"project_id" bigint NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"can_follow_conversation" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "published_documents_uuid_unique" UNIQUE("uuid")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."published_documents" ADD CONSTRAINT "published_documents_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "latitude"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."published_documents" ADD CONSTRAINT "published_documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "latitude"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "published_doc_workspace_idx" ON "latitude"."published_documents" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "unique_project_document_uuid_idx" ON "latitude"."published_documents" USING btree ("project_id","document_uuid");
ALTER TABLE "latitude"."document_suggestions" ADD COLUMN "workspace_id" bigint;--> statement-breakpoint
ALTER TABLE "latitude"."document_suggestions" ADD COLUMN "old_prompt" text;--> statement-breakpoint
ALTER TABLE "latitude"."document_suggestions" ADD COLUMN "new_prompt" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."document_suggestions" ADD CONSTRAINT "document_suggestions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "latitude"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_suggestions_workspace_id_idx" ON "latitude"."document_suggestions" USING btree ("workspace_id");
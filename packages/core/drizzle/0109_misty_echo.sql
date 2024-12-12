ALTER TABLE "latitude"."traces" DROP CONSTRAINT "traces_project_id_projects_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "traces_project_id_idx";--> statement-breakpoint
ALTER TABLE "latitude"."traces" ADD COLUMN "workspace_id" bigint NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."traces" ADD CONSTRAINT "traces_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "latitude"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "traces_workspace_id_idx" ON "latitude"."traces" USING btree ("workspace_id");--> statement-breakpoint
ALTER TABLE "latitude"."traces" DROP COLUMN IF EXISTS "project_id";
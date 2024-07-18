ALTER TABLE "latitude"."commits" DROP CONSTRAINT "commits_next_commit_id_commits_id_fk";
--> statement-breakpoint
ALTER TABLE "latitude"."commits" DROP CONSTRAINT "commits_project_id_workspaces_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "commit_next_commit_idx";--> statement-breakpoint
ALTER TABLE "latitude"."commits" ADD COLUMN "merged_at" timestamp;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."commits" ADD CONSTRAINT "commits_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "latitude"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_commit_order_idx" ON "latitude"."commits" USING btree ("merged_at","project_id");--> statement-breakpoint
ALTER TABLE "latitude"."commits" DROP COLUMN IF EXISTS "next_commit_id";
ALTER TABLE "latitude"."evaluations_v2" RENAME TO "evaluation_versions";--> statement-breakpoint
ALTER TABLE "latitude"."evaluation_versions" DROP CONSTRAINT "evaluations_v2_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "latitude"."evaluation_versions" DROP CONSTRAINT "evaluations_v2_document_versions_fk";
--> statement-breakpoint
ALTER TABLE "latitude"."evaluation_results_v2" DROP CONSTRAINT "evaluation_results_v2_evaluation_id_evaluations_v2_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "evaluations_v2_workspace_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "evaluations_v2_commit_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "evaluations_v2_document_uuid_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "evaluation_results_v2_evaluation_id_idx";--> statement-breakpoint
ALTER TABLE "latitude"."evaluation_versions" ADD COLUMN "evaluation_uuid" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."evaluation_results_v2" ADD COLUMN "commit_id" bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."evaluation_results_v2" ADD COLUMN "evaluation_uuid" uuid NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."evaluation_versions" ADD CONSTRAINT "evaluation_versions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "latitude"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."evaluation_versions" ADD CONSTRAINT "evaluation_versions_document_versions_fk" FOREIGN KEY ("commit_id","document_uuid") REFERENCES "latitude"."document_versions"("commit_id","document_uuid") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."evaluation_results_v2" ADD CONSTRAINT "evaluation_results_v2_commit_id_commits_id_fk" FOREIGN KEY ("commit_id") REFERENCES "latitude"."commits"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evaluation_versions_workspace_id_idx" ON "latitude"."evaluation_versions" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evaluation_versions_commit_id_idx" ON "latitude"."evaluation_versions" USING btree ("commit_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evaluation_versions_evaluation_uuid_idx" ON "latitude"."evaluation_versions" USING btree ("evaluation_uuid");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "evaluation_versions_unique_evaluation_uuid_commit_id" ON "latitude"."evaluation_versions" USING btree ("evaluation_uuid","commit_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evaluation_versions_document_uuid_idx" ON "latitude"."evaluation_versions" USING btree ("document_uuid");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evaluation_results_v2_commit_id_idx" ON "latitude"."evaluation_results_v2" USING btree ("commit_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evaluation_results_v2_evaluation_uuid_idx" ON "latitude"."evaluation_results_v2" USING btree ("evaluation_uuid");--> statement-breakpoint
ALTER TABLE "latitude"."evaluation_results_v2" DROP COLUMN IF EXISTS "evaluation_id";
ALTER TABLE "latitude"."evaluation_versions" DROP CONSTRAINT "evaluation_versions_document_versions_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "evaluation_versions_unique_evaluation_uuid_commit_id";--> statement-breakpoint
ALTER TABLE "latitude"."evaluation_results_v2" ADD COLUMN "uuid" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."evaluation_versions" ADD CONSTRAINT "evaluation_versions_commit_id_commits_id_fk" FOREIGN KEY ("commit_id") REFERENCES "latitude"."commits"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "evaluation_versions_unique_commit_id_evaluation_uuid" ON "latitude"."evaluation_versions" USING btree ("commit_id","evaluation_uuid");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evaluation_results_v2_created_at_idx" ON "latitude"."evaluation_results_v2" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "latitude"."evaluation_results_v2" ADD CONSTRAINT "evaluation_results_v2_uuid_unique" UNIQUE("uuid");
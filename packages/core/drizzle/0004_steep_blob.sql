ALTER TABLE "latitude"."commits" DROP CONSTRAINT "commits_next_commit_id_commits_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "commit_next_commit_idx";--> statement-breakpoint
ALTER TABLE "latitude"."commits" ADD COLUMN "merged_at" timestamp;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_commit_order_idx" ON "latitude"."commits" USING btree ("merged_at","project_id");--> statement-breakpoint
ALTER TABLE "latitude"."commits" DROP COLUMN IF EXISTS "next_commit_id";
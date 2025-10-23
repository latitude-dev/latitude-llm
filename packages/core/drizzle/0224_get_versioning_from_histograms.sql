ALTER TABLE "latitude"."issues" DROP CONSTRAINT "issues_commit_id_commits_id_fk";
--> statement-breakpoint
DROP INDEX "latitude"."issues_commit_id_idx";--> statement-breakpoint
DROP INDEX "latitude"."issues_first_seen_at_idx";--> statement-breakpoint
DROP INDEX "latitude"."issues_last_seen_at_idx";--> statement-breakpoint
ALTER TABLE "latitude"."issue_histograms" ADD COLUMN "commit_id" bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."issue_histograms" ADD CONSTRAINT "issue_histograms_commit_id_commits_id_fk" FOREIGN KEY ("commit_id") REFERENCES "latitude"."commits"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "issue_histograms_commit_id_idx" ON "latitude"."issue_histograms" USING btree ("commit_id");--> statement-breakpoint
ALTER TABLE "latitude"."issues" DROP COLUMN "commit_id";--> statement-breakpoint
ALTER TABLE "latitude"."issues" DROP COLUMN "first_seen_at";--> statement-breakpoint
ALTER TABLE "latitude"."issues" DROP COLUMN "last_seen_at";
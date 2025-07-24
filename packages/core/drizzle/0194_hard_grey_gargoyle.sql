ALTER TABLE "latitude"."segments" DROP CONSTRAINT "segments_log_uuid_document_logs_uuid_fk";
--> statement-breakpoint
ALTER TABLE "latitude"."segments" DROP CONSTRAINT "segments_commit_uuid_commits_uuid_fk";
--> statement-breakpoint
ALTER TABLE "latitude"."segments" DROP CONSTRAINT "segments_experiment_uuid_experiments_uuid_fk";

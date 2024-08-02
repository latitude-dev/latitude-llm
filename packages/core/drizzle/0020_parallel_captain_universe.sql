ALTER TABLE "latitude"."commits" ADD COLUMN "version" bigint;--> statement-breakpoint
ALTER TABLE "latitude"."commits" ADD CONSTRAINT "unique_commit_version" UNIQUE("version","project_id");
-- Deleting existing threads. We want to enforce project_id on threads.
-- Because we're on beta, it's okay to lose existing threads. Sorry
DELETE FROM "latitude"."latte_requests";--> statement-breakpoint
DELETE FROM "latitude"."latte_threads";--> statement-breakpoint

ALTER TABLE "latitude"."latte_threads" ADD COLUMN "project_id" bigint NOT NULL;--> statement-breakpoint
CREATE INDEX "latte_threads_workspace_index" ON "latitude"."latte_threads" USING btree ("workspace_id");

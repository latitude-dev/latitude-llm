-- Empty these tables to avoid foreign key constraint issues
-- We're in BETA so it's okay to lose this data
DELETE FROM "latitude"."latte_requests";--> statement-breakpoint
DELETE FROM "latitude"."latte_threads";--> statement-breakpoint

ALTER TABLE "latitude"."latte_threads" ADD COLUMN "project_id" bigint NOT NULL;--> statement-breakpoint
CREATE INDEX "latte_threads_project_index" ON "latitude"."latte_threads" USING btree ("project_id");
DROP INDEX "latitude"."latte_threads_uuid_index";--> statement-breakpoint

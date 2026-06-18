ALTER TABLE "latitude"."evaluations" ADD COLUMN "legacy_polarity" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Every evaluation that exists at cutover time predates the passed-polarity inversion, so its stored
-- judge script emits passed=true for the behavior's ABSENCE. Mark them legacy; new evaluations default false.
UPDATE "latitude"."evaluations" SET "legacy_polarity" = true;--> statement-breakpoint
DROP INDEX "latitude"."scores_signal_lookup_idx";--> statement-breakpoint
CREATE INDEX "scores_signal_lookup_idx" ON "latitude"."scores" ("organization_id","project_id","signal_id","created_at","id") WHERE "signal_id" IS NOT NULL AND "drafted_at" IS NULL;--> statement-breakpoint
DROP INDEX "latitude"."scores_signal_discovery_work_idx";--> statement-breakpoint
CREATE INDEX "scores_signal_discovery_work_idx" ON "latitude"."scores" ("organization_id","project_id","created_at","id") WHERE "drafted_at" IS NULL AND "errored" = false AND "passed" = false AND "signal_id" IS NULL;
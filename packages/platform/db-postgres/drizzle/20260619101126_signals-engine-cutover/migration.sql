ALTER TABLE "latitude"."scores" RENAME COLUMN "source" TO "source_type";--> statement-breakpoint
ALTER TABLE "latitude"."evaluations" ADD COLUMN "legacy_polarity" boolean DEFAULT false NOT NULL;--> statement-breakpoint
DROP INDEX "latitude"."scores_canonical_evaluation_trace_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "scores_canonical_evaluation_trace_idx" ON "latitude"."scores" ("organization_id","project_id","source_id","trace_id") WHERE "source_type" = 'evaluation' AND "drafted_at" IS NULL AND "trace_id" IS NOT NULL;--> statement-breakpoint
DROP INDEX "latitude"."scores_signal_discovery_work_idx";--> statement-breakpoint
CREATE INDEX "scores_signal_discovery_work_idx" ON "latitude"."scores" ("organization_id","project_id","created_at","id") WHERE "drafted_at" IS NULL AND "errored" = false AND "passed" = true AND "signal_id" IS NULL;--> statement-breakpoint
-- Every evaluation that exists at cutover time predates the passed-polarity inversion, so its stored
-- judge script emits passed=true for the behavior's ABSENCE. Mark them legacy; new evaluations default false.
UPDATE "latitude"."evaluations" SET "legacy_polarity" = true;--> statement-breakpoint
-- One-time cutover: a signal's occurrences are now its matching scores (passed = true = the behavior
-- is present in the trace). Existing evaluation + annotation scores were written under the old
-- problem-detector polarity (passed = false = exhibits), so flip them once. Errored rows are left
-- alone: errored is never an occurrence, and the score entity forbids passed = true on an errored row.
UPDATE "latitude"."scores"
SET "passed" = NOT "passed"
WHERE "source_type" IN ('evaluation', 'annotation')
  AND "errored" = false;

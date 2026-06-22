ALTER TABLE "latitude"."evaluations" DROP COLUMN "legacy_polarity";--> statement-breakpoint
DROP INDEX "latitude"."scores_signal_discovery_work_idx";--> statement-breakpoint
CREATE INDEX "scores_signal_discovery_work_idx" ON "latitude"."scores" ("organization_id","project_id","created_at","id") WHERE "drafted_at" IS NULL AND "errored" = false AND "passed" = false AND "signal_id" IS NULL;--> statement-breakpoint
-- Reverts the Signals PR1 (#3621) passed-polarity flip back to the original
-- problem-detector convention (passed = false = behavior present). The CH column +
-- the source_type rename are kept (this is PG, the column is source_type).
--
-- DEPLOY ORDER (hard requirement, not advisory): run this BEFORE or atomically with the
-- reverted-code deploy. If PR1 (new-polarity) code is still live after the data re-flip, it writes
-- fresh passed=true / always-stamped signal_id rows this one-shot migration won't catch, leaving a
-- mixed-polarity dataset.

-- (A) Evaluation + flagger (source_id = 'SYSTEM') annotation scores were written
-- uniformly in the new polarity (evals via the legacy-polarity boundary inversion;
-- flaggers via the flipped default) and the one-time PR1 migration flipped the
-- pre-cutover ones. Re-flip all of them back. Errored rows are left alone.
UPDATE "latitude"."scores"
SET "passed" = NOT "passed"
WHERE "errored" = false
  AND ("source_type" = 'evaluation' OR ("source_type" = 'annotation' AND "source_id" = 'SYSTEM'));--> statement-breakpoint

-- (B) Human annotations (source_id <> 'SYSTEM') use `passed` as a sentiment attribute
-- (thumbs up = passed true). PR1 never changed that write path; only the annotation rows that
-- already existed when PR1's one-time migration RAN in production (2026-06-18 22:00 UTC — the
-- migration-run time, NOT the later v0.3.11 app deploy) were inverted. Rows created after that
-- cutoff are already correct, so re-flip only the rows created before it.
UPDATE "latitude"."scores"
SET "passed" = NOT "passed"
WHERE "errored" = false
  AND "source_type" = 'annotation'
  AND "source_id" <> 'SYSTEM'
  AND "created_at" < '2026-06-18 22:00:00+00';--> statement-breakpoint

-- (C) PR1 always-stamped signal_id on every evaluation run; the original writer stamped
-- it only on completed matches. After the re-flip an occurrence is passed = false, so
-- clear signal_id from the non-occurrence evaluation rows (passed = true or errored).
-- Annotations keep their signal_id (it is assigned by discovery/linking, not always-stamped).
UPDATE "latitude"."scores"
SET "signal_id" = NULL
WHERE "source_type" = 'evaluation'
  AND ("passed" = true OR "errored" = true);

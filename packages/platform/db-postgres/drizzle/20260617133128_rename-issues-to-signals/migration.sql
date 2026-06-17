-- Phase 1: rename Issues -> Signals (in-place). Brief rollover downtime is accepted:
-- old app tasks query the renamed objects during the rolling deploy. Column semantics unchanged.

-- table
ALTER TABLE "latitude"."issues" RENAME TO "signals";--> statement-breakpoint

-- columns on other tables
ALTER TABLE "latitude"."scores" RENAME COLUMN "issue_id" TO "signal_id";--> statement-breakpoint
ALTER TABLE "latitude"."evaluations" RENAME COLUMN "issue_id" TO "signal_id";--> statement-breakpoint

-- indexes
ALTER INDEX "latitude"."issues_project_lifecycle_idx" RENAME TO "signals_project_lifecycle_idx";--> statement-breakpoint
ALTER INDEX "latitude"."issues_search_document_idx" RENAME TO "signals_search_document_idx";--> statement-breakpoint
ALTER INDEX "latitude"."scores_issue_lookup_idx" RENAME TO "scores_signal_lookup_idx";--> statement-breakpoint
ALTER INDEX "latitude"."scores_issue_discovery_work_idx" RENAME TO "scores_signal_discovery_work_idx";--> statement-breakpoint
ALTER INDEX "latitude"."evaluations_issue_lookup_idx" RENAME TO "evaluations_signal_lookup_idx";--> statement-breakpoint

-- constraints (PK + uniques; renames the backing index too)
ALTER TABLE "latitude"."signals" RENAME CONSTRAINT "issues_pkey" TO "signals_pkey";--> statement-breakpoint
ALTER TABLE "latitude"."signals" RENAME CONSTRAINT "issues_unique_slug_per_project_idx" TO "signals_unique_slug_per_project_idx";--> statement-breakpoint
ALTER TABLE "latitude"."signals" RENAME CONSTRAINT "issues_uuid_key" TO "signals_uuid_key";--> statement-breakpoint

-- RLS policy
ALTER POLICY "issues_organization_policy" ON "latitude"."signals" RENAME TO "signals_organization_policy";--> statement-breakpoint

-- in-flight domain events: rename the persisted dispatch token + aggregate type on
-- unpublished outbox rows so they route through the renamed handler map (the worker also
-- keeps an EVENT_NAME_ALIASES shim for any already in BullMQ at deploy time).
UPDATE "latitude"."outbox_events" SET "event_name" = 'SignalCreated'         WHERE "event_name" = 'IssueCreated'         AND "published" = false;--> statement-breakpoint
UPDATE "latitude"."outbox_events" SET "event_name" = 'SignalRegressed'       WHERE "event_name" = 'IssueRegressed'       AND "published" = false;--> statement-breakpoint
UPDATE "latitude"."outbox_events" SET "event_name" = 'SignalEscalated'       WHERE "event_name" = 'IssueEscalated'       AND "published" = false;--> statement-breakpoint
UPDATE "latitude"."outbox_events" SET "event_name" = 'SignalAssigneeChanged' WHERE "event_name" = 'IssueAssigneeChanged' AND "published" = false;--> statement-breakpoint
UPDATE "latitude"."outbox_events" SET "event_name" = 'SignalEscalationEnded' WHERE "event_name" = 'IssueEscalationEnded' AND "published" = false;--> statement-breakpoint
UPDATE "latitude"."outbox_events" SET "event_name" = 'ScoreAssignedToSignal' WHERE "event_name" = 'ScoreAssignedToIssue' AND "published" = false;--> statement-breakpoint
UPDATE "latitude"."outbox_events" SET "aggregate_type" = 'signal' WHERE "aggregate_type" = 'issue' AND "published" = false;

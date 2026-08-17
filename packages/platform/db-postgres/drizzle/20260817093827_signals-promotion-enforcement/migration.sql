DROP INDEX "latitude"."signals_project_lifecycle_idx";--> statement-breakpoint
-- The promotion gate starts being enforced with this deploy, so the gate applies
-- to signals discovered from here on. Everything discovered while promotion was
-- only being observed already notified the organization and already dispatched
-- its agents, so hiding it now would retract signals people have seen and would
-- let a later promotion dispatch a second agent for the same signal. Promote the
-- lot instead — the same reasoning that backfilled the column when it was added.
UPDATE "latitude"."signals" SET promoted_at = created_at WHERE promoted_at IS NULL;--> statement-breakpoint
CREATE INDEX "signals_project_lifecycle_idx" ON "latitude"."signals" ("organization_id","project_id","ignored_at","resolved_at","muted_at","created_at") WHERE "deleted_at" IS NULL AND "promoted_at" IS NOT NULL;

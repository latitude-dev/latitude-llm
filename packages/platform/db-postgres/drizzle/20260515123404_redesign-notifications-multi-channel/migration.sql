-- Multi-channel notifications redesign.
--
-- Drops and recreates the `notifications` table: the feature is behind a
-- feature flag with no real users on it, so we can reshape the data model
-- freely. The new shape:
--   - `type` (polymorphic) + `payload->>'event'` (nested discriminator) collapse
--     into a single flat `kind` column (`incident.opened`, `incident.closed`,
--     `wrapped.report`, `custom.message`, ...).
--   - `source_id` → producer-computed `idempotency_key`. The unique index now
--     reads `(organization_id, user_id, idempotency_key)` with no JSONB
--     extraction.
--   - `project_id` is an optional anchor for kinds tied to a project
--     (incidents, wrapped reports). The `ProjectDeleted` domain event fires
--     a `notifications:delete-by-project` task that removes all rows with
--     this set — per the platform's no-FK rule, referential integrity is
--     application-layer.
--   - `emailed_at` is added for channel-level idempotency: the email worker
--     stamps it on a successful send, conditional on `IS NULL` to absorb
--     at-least-once redelivery.
--
-- Also adds `users.notification_preferences` (jsonb, nullable) for per-group
-- email opt-out preferences.

DROP TABLE "latitude"."notifications";
--> statement-breakpoint
CREATE TABLE "latitude"."notifications" (
	"id" varchar(24) PRIMARY KEY,
	"organization_id" varchar(24) NOT NULL,
	"user_id" varchar(24) NOT NULL,
	"kind" varchar(64) NOT NULL,
	"idempotency_key" text NOT NULL,
	"project_id" varchar(24),
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"seen_at" timestamp with time zone,
	"emailed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "latitude"."notifications" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE INDEX "notifications_user_org_recent_idx" ON "latitude"."notifications" ("user_id","organization_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX "notifications_user_org_unread_idx" ON "latitude"."notifications" ("user_id","organization_id") WHERE "seen_at" is null;
--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_idempotency_uq" ON "latitude"."notifications" ("organization_id","user_id","idempotency_key");
--> statement-breakpoint
CREATE INDEX "notifications_org_project_idx" ON "latitude"."notifications" ("organization_id","project_id") WHERE "project_id" is not null;
--> statement-breakpoint
CREATE POLICY "notifications_organization_policy" ON "latitude"."notifications" AS PERMISSIVE FOR ALL TO public USING (organization_id = get_current_organization_id()) WITH CHECK (organization_id = get_current_organization_id());
--> statement-breakpoint
ALTER TABLE "latitude"."users" ADD COLUMN "notification_preferences" jsonb;

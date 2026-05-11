CREATE TABLE "latitude"."notifications" (
	"id" varchar(24) PRIMARY KEY,
	"organization_id" varchar(24) NOT NULL,
	"user_id" varchar(24) NOT NULL,
	"type" varchar(32) NOT NULL,
	"source_id" varchar(24),
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"seen_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "latitude"."notifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "notifications_user_org_recent_idx" ON "latitude"."notifications" ("user_id","organization_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "notifications_user_org_unread_idx" ON "latitude"."notifications" ("user_id","organization_id") WHERE "seen_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_incident_event_uq" ON "latitude"."notifications" ("organization_id","user_id","source_id",("payload"->>'event')) WHERE "type" = 'incident' and "source_id" is not null;--> statement-breakpoint
CREATE POLICY "notifications_organization_policy" ON "latitude"."notifications" AS PERMISSIVE FOR ALL TO public USING (organization_id = get_current_organization_id()) WITH CHECK (organization_id = get_current_organization_id());

CREATE TABLE "latitude"."monitor_alerts" (
	"id" varchar(24) PRIMARY KEY,
	"organization_id" varchar(24) NOT NULL,
	"monitor_id" varchar(24) NOT NULL,
	"kind" varchar(64) NOT NULL,
	"source_type" varchar(32) NOT NULL,
	"source_id" varchar(24),
	"condition" jsonb,
	"severity" varchar(16) NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "latitude"."monitor_alerts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "latitude"."monitors" (
	"id" varchar(24) PRIMARY KEY,
	"organization_id" varchar(24) NOT NULL,
	"project_id" varchar(24) NOT NULL,
	"slug" varchar(128) NOT NULL,
	"name" varchar(128) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"system" boolean DEFAULT false NOT NULL,
	"muted_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "latitude"."monitors" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "latitude"."alert_incidents" ADD COLUMN "monitor_alert_id" varchar(24);--> statement-breakpoint
ALTER TABLE "latitude"."alert_incidents" ADD COLUMN "condition" jsonb;--> statement-breakpoint
CREATE INDEX "alert_incidents_monitor_alert_idx" ON "latitude"."alert_incidents" ("monitor_alert_id","started_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE monitor_alert_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "monitor_alerts_monitor_idx" ON "latitude"."monitor_alerts" ("monitor_id");--> statement-breakpoint
CREATE INDEX "monitor_alerts_source_idx" ON "latitude"."monitor_alerts" ("organization_id","source_type","source_id") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "monitors_project_slug_uq" ON "latitude"."monitors" ("project_id","slug") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "monitors_org_project_active_idx" ON "latitude"."monitors" ("organization_id","project_id") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE POLICY "monitor_alerts_organization_policy" ON "latitude"."monitor_alerts" AS PERMISSIVE FOR ALL TO public USING (organization_id = get_current_organization_id()) WITH CHECK (organization_id = get_current_organization_id());--> statement-breakpoint
CREATE POLICY "monitors_organization_policy" ON "latitude"."monitors" AS PERMISSIVE FOR ALL TO public USING (organization_id = get_current_organization_id()) WITH CHECK (organization_id = get_current_organization_id());
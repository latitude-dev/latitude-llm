CREATE TABLE "latitude"."alert_incidents" (
	"id" varchar(24) PRIMARY KEY,
	"organization_id" varchar(24) NOT NULL,
	"project_id" varchar(24) NOT NULL,
	"source_type" varchar(32) NOT NULL,
	"source_id" varchar(24) NOT NULL,
	"kind" varchar(64) NOT NULL,
	"severity" varchar(16) NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "latitude"."alert_incidents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "alert_incidents_project_started_at_idx" ON "latitude"."alert_incidents" ("organization_id","project_id","started_at");--> statement-breakpoint
CREATE INDEX "alert_incidents_source_idx" ON "latitude"."alert_incidents" ("source_type","source_id","started_at");--> statement-breakpoint
CREATE POLICY "alert_incidents_organization_policy" ON "latitude"."alert_incidents" AS PERMISSIVE FOR ALL TO public USING (organization_id = get_current_organization_id()) WITH CHECK (organization_id = get_current_organization_id());

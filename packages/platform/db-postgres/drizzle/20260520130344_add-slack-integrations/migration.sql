CREATE TABLE "latitude"."slack_integrations" (
	"id" varchar(24) PRIMARY KEY,
	"organization_id" varchar(24) NOT NULL,
	"team_id" text NOT NULL,
	"team_name" text NOT NULL,
	"app_id" text NOT NULL,
	"bot_user_id" text NOT NULL,
	"bot_access_token" text NOT NULL,
	"bot_token_scopes" text NOT NULL,
	"refresh_token" text,
	"token_expires_at" timestamp with time zone,
	"installed_by_user_id" varchar(24) NOT NULL,
	"installed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "latitude"."slack_integrations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "slack_integrations_organization_id_idx" ON "latitude"."slack_integrations" ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "slack_integrations_active_organization_idx" ON "latitude"."slack_integrations" ("organization_id") WHERE "revoked_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "slack_integrations_active_team_idx" ON "latitude"."slack_integrations" ("team_id") WHERE "revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "slack_integrations_team_id_idx" ON "latitude"."slack_integrations" ("team_id");--> statement-breakpoint
CREATE POLICY "slack_integrations_organization_policy" ON "latitude"."slack_integrations" AS PERMISSIVE FOR ALL TO public USING (organization_id = get_current_organization_id()) WITH CHECK (organization_id = get_current_organization_id());
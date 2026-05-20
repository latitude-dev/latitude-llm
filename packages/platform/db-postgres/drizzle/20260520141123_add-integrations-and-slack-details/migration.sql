CREATE TABLE "latitude"."integrations" (
	"id" varchar(24) PRIMARY KEY,
	"organization_id" varchar(24) NOT NULL,
	"kind" varchar(64) NOT NULL,
	"vendor_account_id" text NOT NULL,
	"installed_by_user_id" varchar(24) NOT NULL,
	"installed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "latitude"."integrations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "latitude"."slack_integration_details" (
	"integration_id" varchar(24) PRIMARY KEY,
	"organization_id" varchar(24) NOT NULL,
	"team_name" text NOT NULL,
	"app_id" text NOT NULL,
	"bot_user_id" text NOT NULL,
	"bot_access_token" text NOT NULL,
	"bot_token_scopes" text NOT NULL,
	"refresh_token" text,
	"token_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "latitude"."slack_integration_details" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "integrations_organization_id_idx" ON "latitude"."integrations" ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "integrations_active_organization_kind_idx" ON "latitude"."integrations" ("organization_id","kind") WHERE "revoked_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "integrations_active_kind_vendor_account_idx" ON "latitude"."integrations" ("kind","vendor_account_id") WHERE "revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "integrations_kind_vendor_account_idx" ON "latitude"."integrations" ("kind","vendor_account_id");--> statement-breakpoint
CREATE INDEX "slack_integration_details_organization_id_idx" ON "latitude"."slack_integration_details" ("organization_id");--> statement-breakpoint
CREATE POLICY "integrations_organization_policy" ON "latitude"."integrations" AS PERMISSIVE FOR ALL TO public USING (organization_id = get_current_organization_id()) WITH CHECK (organization_id = get_current_organization_id());--> statement-breakpoint
CREATE POLICY "slack_integration_details_organization_policy" ON "latitude"."slack_integration_details" AS PERMISSIVE FOR ALL TO public USING (organization_id = get_current_organization_id()) WITH CHECK (organization_id = get_current_organization_id());
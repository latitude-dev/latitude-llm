CREATE TABLE "latitude"."elevenlabs_webhook_endpoints" (
	"id" varchar(24) PRIMARY KEY,
	"organization_id" varchar(24) NOT NULL,
	"project_id" varchar(24) NOT NULL,
	"webhook_token" varchar(64) NOT NULL,
	"signing_secret" text NOT NULL,
	"created_by_user_id" varchar(24) NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "latitude"."elevenlabs_webhook_endpoints" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE INDEX "elevenlabs_webhook_endpoints_organization_id_idx" ON "latitude"."elevenlabs_webhook_endpoints" ("organization_id");
--> statement-breakpoint
CREATE INDEX "elevenlabs_webhook_endpoints_project_id_idx" ON "latitude"."elevenlabs_webhook_endpoints" ("project_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "elevenlabs_webhook_endpoints_active_project_idx" ON "latitude"."elevenlabs_webhook_endpoints" ("project_id") WHERE "revoked_at" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "elevenlabs_webhook_endpoints_active_token_idx" ON "latitude"."elevenlabs_webhook_endpoints" ("webhook_token") WHERE "revoked_at" IS NULL;
--> statement-breakpoint
CREATE POLICY "elevenlabs_webhook_endpoints_organization_policy" ON "latitude"."elevenlabs_webhook_endpoints" AS PERMISSIVE FOR ALL TO public USING (organization_id = get_current_organization_id()) WITH CHECK (organization_id = get_current_organization_id());

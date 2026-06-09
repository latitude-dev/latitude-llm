CREATE TABLE "latitude"."sso_providers" (
	"id" varchar(24) PRIMARY KEY,
	"issuer" text NOT NULL,
	"oidc_config" text,
	"saml_config" text,
	"user_id" varchar(24),
	"provider_id" text NOT NULL UNIQUE,
	"organization_id" varchar(24),
	"domain" text NOT NULL,
	"domain_verified" boolean DEFAULT false NOT NULL,
	"enforced" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "latitude"."sso_providers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "ssoProviders_organizationId_unique_idx" ON "latitude"."sso_providers" ("organization_id");--> statement-breakpoint
CREATE INDEX "ssoProviders_organizationId_idx" ON "latitude"."sso_providers" ("organization_id");--> statement-breakpoint
CREATE INDEX "ssoProviders_domain_idx" ON "latitude"."sso_providers" ("domain");--> statement-breakpoint
CREATE INDEX "ssoProviders_userId_idx" ON "latitude"."sso_providers" ("user_id");--> statement-breakpoint
ALTER TABLE "latitude"."sso_providers" ADD CONSTRAINT "sso_providers_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "latitude"."users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "latitude"."sso_providers" ADD CONSTRAINT "sso_providers_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "latitude"."organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
CREATE POLICY "sso_providers_organization_policy" ON "latitude"."sso_providers" AS PERMISSIVE FOR ALL TO public USING (organization_id = get_current_organization_id()) WITH CHECK (organization_id = get_current_organization_id());
CREATE TABLE "latitude"."oauth_access_tokens" (
	"id" varchar(24) PRIMARY KEY,
	"access_token" text UNIQUE,
	"refresh_token" text UNIQUE,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"client_id" text,
	"user_id" varchar(24),
	"scopes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "latitude"."oauth_applications" (
	"id" varchar(24) PRIMARY KEY,
	"name" text,
	"icon" text,
	"metadata" text,
	"client_id" text UNIQUE,
	"client_secret" text,
	"redirect_urls" text,
	"type" text,
	"disabled" boolean DEFAULT false,
	"user_id" varchar(24),
	"organization_id" varchar(24),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "latitude"."oauth_applications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "latitude"."oauth_consents" (
	"id" varchar(24) PRIMARY KEY,
	"client_id" text,
	"user_id" varchar(24),
	"scopes" text,
	"consent_given" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "oauthAccessTokens_clientId_idx" ON "latitude"."oauth_access_tokens" ("client_id");--> statement-breakpoint
CREATE INDEX "oauthAccessTokens_userId_idx" ON "latitude"."oauth_access_tokens" ("user_id");--> statement-breakpoint
CREATE INDEX "oauthApplications_userId_idx" ON "latitude"."oauth_applications" ("user_id");--> statement-breakpoint
CREATE INDEX "oauthApplications_organizationId_idx" ON "latitude"."oauth_applications" ("organization_id");--> statement-breakpoint
CREATE INDEX "oauthConsents_clientId_idx" ON "latitude"."oauth_consents" ("client_id");--> statement-breakpoint
CREATE INDEX "oauthConsents_userId_idx" ON "latitude"."oauth_consents" ("user_id");--> statement-breakpoint
ALTER TABLE "latitude"."oauth_access_tokens" ADD CONSTRAINT "oauth_access_tokens_client_id_oauth_applications_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "latitude"."oauth_applications"("client_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "latitude"."oauth_access_tokens" ADD CONSTRAINT "oauth_access_tokens_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "latitude"."users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "latitude"."oauth_applications" ADD CONSTRAINT "oauth_applications_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "latitude"."users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "latitude"."oauth_applications" ADD CONSTRAINT "oauth_applications_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "latitude"."organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "latitude"."oauth_consents" ADD CONSTRAINT "oauth_consents_client_id_oauth_applications_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "latitude"."oauth_applications"("client_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "latitude"."oauth_consents" ADD CONSTRAINT "oauth_consents_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "latitude"."users"("id") ON DELETE CASCADE;--> statement-breakpoint
CREATE POLICY "oauth_applications_organization_policy" ON "latitude"."oauth_applications" AS PERMISSIVE FOR ALL TO public USING (organization_id = get_current_organization_id()) WITH CHECK (organization_id = get_current_organization_id());
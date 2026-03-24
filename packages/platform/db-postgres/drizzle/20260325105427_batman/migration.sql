CREATE TABLE "latitude"."api_keys" (
	"id" varchar(24) PRIMARY KEY,
	"token" text NOT NULL,
	"token_hash" text NOT NULL UNIQUE,
	"organization_id" varchar(24) NOT NULL,
	"name" varchar(256) DEFAULT '' NOT NULL,
	"last_used_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "latitude"."api_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "latitude"."accounts" (
	"id" varchar(24) PRIMARY KEY,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" varchar(24) NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "latitude"."invitations" (
	"id" varchar(24) PRIMARY KEY,
	"organization_id" varchar(24) NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"inviter_id" varchar(24) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "latitude"."invitations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "latitude"."members" (
	"id" varchar(24) PRIMARY KEY,
	"organization_id" varchar(24) NOT NULL,
	"user_id" varchar(24) NOT NULL,
	"role" varchar(50) DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "latitude"."members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "latitude"."organizations" (
	"id" varchar(24) PRIMARY KEY,
	"name" text NOT NULL,
	"slug" text NOT NULL UNIQUE,
	"logo" text,
	"metadata" text,
	"stripe_customer_id" text,
	"settings" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "latitude"."sessions" (
	"id" varchar(24) PRIMARY KEY,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL UNIQUE,
	"ip_address" text,
	"user_agent" text,
	"user_id" varchar(24) NOT NULL,
	"active_organization_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "latitude"."subscriptions" (
	"id" varchar(24) PRIMARY KEY,
	"plan" text NOT NULL,
	"reference_id" text NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"status" text DEFAULT 'incomplete',
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"trial_start" timestamp with time zone,
	"trial_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false,
	"cancel_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"seats" integer,
	"billing_interval" text,
	"stripe_schedule_id" text
);
--> statement-breakpoint
ALTER TABLE "latitude"."subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "latitude"."users" (
	"id" varchar(24) PRIMARY KEY,
	"name" text NOT NULL,
	"email" text NOT NULL UNIQUE,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" varchar(50) DEFAULT 'user' NOT NULL,
	"stripe_customer_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "latitude"."verifications" (
	"id" varchar(24) PRIMARY KEY,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "latitude"."datasets" (
	"id" varchar(24) PRIMARY KEY,
	"organization_id" varchar(24) NOT NULL,
	"project_id" varchar(24) NOT NULL,
	"name" varchar(256) NOT NULL,
	"description" text,
	"file_key" text,
	"current_version" bigint DEFAULT 0 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "datasets_unique_name_per_project_idx" UNIQUE NULLS NOT DISTINCT("organization_id","project_id","name","deleted_at")
);
--> statement-breakpoint
ALTER TABLE "latitude"."datasets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "latitude"."dataset_versions" (
	"id" varchar(24) PRIMARY KEY,
	"organization_id" varchar(24) NOT NULL,
	"dataset_id" varchar(24) NOT NULL,
	"version" bigint NOT NULL,
	"rows_inserted" integer DEFAULT 0 NOT NULL,
	"rows_updated" integer DEFAULT 0 NOT NULL,
	"rows_deleted" integer DEFAULT 0 NOT NULL,
	"source" varchar(64) DEFAULT 'api' NOT NULL,
	"actor_id" varchar(24),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "latitude"."dataset_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "latitude"."outbox_events" (
	"id" varchar(24) PRIMARY KEY,
	"event_name" text NOT NULL,
	"aggregate_id" varchar(24) NOT NULL,
	"workspace_id" varchar(24) NOT NULL,
	"payload" jsonb NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "latitude"."projects" (
	"id" varchar(24) PRIMARY KEY,
	"organization_id" varchar(24) NOT NULL,
	"name" varchar(256) NOT NULL,
	"slug" varchar(256) NOT NULL,
	"settings" jsonb,
	"deleted_at" timestamp with time zone,
	"last_edited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "latitude"."projects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "latitude"."scores" (
	"id" varchar(24) PRIMARY KEY,
	"organization_id" varchar(24) NOT NULL,
	"project_id" varchar(24) NOT NULL,
	"session_id" varchar(128),
	"trace_id" varchar(32),
	"span_id" varchar(16),
	"source" varchar(32) NOT NULL,
	"source_id" varchar(128) NOT NULL,
	"simulation_id" varchar(24),
	"issue_id" varchar(24),
	"value" double precision NOT NULL,
	"passed" boolean NOT NULL,
	"feedback" text NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"error" text,
	"errored" boolean NOT NULL,
	"duration" bigint DEFAULT 0 NOT NULL,
	"tokens" bigint DEFAULT 0 NOT NULL,
	"cost" bigint DEFAULT 0 NOT NULL,
	"drafted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "latitude"."scores" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "api_keys_organization_id_idx" ON "latitude"."api_keys" ("organization_id");--> statement-breakpoint
CREATE INDEX "accounts_userId_idx" ON "latitude"."accounts" ("user_id");--> statement-breakpoint
CREATE INDEX "invitations_organizationId_idx" ON "latitude"."invitations" ("organization_id");--> statement-breakpoint
CREATE INDEX "invitations_email_idx" ON "latitude"."invitations" ("email");--> statement-breakpoint
CREATE INDEX "invitations_inviterId_idx" ON "latitude"."invitations" ("inviter_id");--> statement-breakpoint
CREATE INDEX "members_organizationId_idx" ON "latitude"."members" ("organization_id");--> statement-breakpoint
CREATE INDEX "members_userId_idx" ON "latitude"."members" ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_userId_idx" ON "latitude"."sessions" ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_activeOrganizationId_idx" ON "latitude"."sessions" ("active_organization_id");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "latitude"."verifications" ("identifier");--> statement-breakpoint
CREATE INDEX "datasets_organization_id_idx" ON "latitude"."datasets" ("organization_id");--> statement-breakpoint
CREATE INDEX "datasets_project_id_idx" ON "latitude"."datasets" ("organization_id","project_id","deleted_at");--> statement-breakpoint
CREATE INDEX "dataset_versions_organization_id_idx" ON "latitude"."dataset_versions" ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dataset_versions_dataset_id_version_idx" ON "latitude"."dataset_versions" ("dataset_id","version");--> statement-breakpoint
CREATE INDEX "outbox_events_workspace_id_idx" ON "latitude"."outbox_events" ("workspace_id");--> statement-breakpoint
CREATE INDEX "projects_organization_id_idx" ON "latitude"."projects" ("organization_id");--> statement-breakpoint
CREATE INDEX "scores_organization_id_idx" ON "latitude"."scores" ("organization_id");--> statement-breakpoint
CREATE INDEX "scores_project_list_idx" ON "latitude"."scores" ("organization_id","project_id","created_at","id") WHERE "drafted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "scores_source_bucket_idx" ON "latitude"."scores" ("organization_id","project_id","source","source_id","created_at","id") WHERE "drafted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "scores_issue_lookup_idx" ON "latitude"."scores" ("organization_id","project_id","issue_id","created_at","id") WHERE "issue_id" IS NOT NULL AND "drafted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "scores_trace_lookup_idx" ON "latitude"."scores" ("organization_id","project_id","trace_id","created_at","id") WHERE "trace_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "scores_session_lookup_idx" ON "latitude"."scores" ("organization_id","project_id","session_id","created_at","id") WHERE "session_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "scores_span_lookup_idx" ON "latitude"."scores" ("organization_id","project_id","span_id","created_at","id") WHERE "span_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "scores_issue_discovery_work_idx" ON "latitude"."scores" ("organization_id","project_id","created_at","id") WHERE "drafted_at" IS NULL AND "errored" = false AND "passed" = false AND "issue_id" IS NULL;--> statement-breakpoint
CREATE INDEX "scores_draft_finalization_idx" ON "latitude"."scores" ("updated_at","id") WHERE "drafted_at" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."accounts" ADD CONSTRAINT "accounts_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "latitude"."users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "latitude"."invitations" ADD CONSTRAINT "invitations_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "latitude"."organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "latitude"."invitations" ADD CONSTRAINT "invitations_inviter_id_users_id_fkey" FOREIGN KEY ("inviter_id") REFERENCES "latitude"."users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "latitude"."members" ADD CONSTRAINT "members_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "latitude"."organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "latitude"."members" ADD CONSTRAINT "members_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "latitude"."users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "latitude"."sessions" ADD CONSTRAINT "sessions_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "latitude"."users"("id") ON DELETE CASCADE;--> statement-breakpoint
CREATE POLICY "api_keys_organization_policy" ON "latitude"."api_keys" AS PERMISSIVE FOR ALL TO public USING (organization_id = get_current_organization_id()) WITH CHECK (organization_id = get_current_organization_id());--> statement-breakpoint
CREATE POLICY "invitations_organization_policy" ON "latitude"."invitations" AS PERMISSIVE FOR ALL TO public USING (organization_id = get_current_organization_id()) WITH CHECK (organization_id = get_current_organization_id());--> statement-breakpoint
CREATE POLICY "members_organization_policy" ON "latitude"."members" AS PERMISSIVE FOR ALL TO public USING (organization_id = get_current_organization_id()) WITH CHECK (organization_id = get_current_organization_id());--> statement-breakpoint
CREATE POLICY "subscriptions_organization_policy" ON "latitude"."subscriptions" AS PERMISSIVE FOR ALL TO public USING (reference_id = get_current_organization_id()) WITH CHECK (reference_id = get_current_organization_id());--> statement-breakpoint
CREATE POLICY "datasets_organization_policy" ON "latitude"."datasets" AS PERMISSIVE FOR ALL TO public USING (organization_id = get_current_organization_id()) WITH CHECK (organization_id = get_current_organization_id());--> statement-breakpoint
CREATE POLICY "dataset_versions_organization_policy" ON "latitude"."dataset_versions" AS PERMISSIVE FOR ALL TO public USING (organization_id = get_current_organization_id()) WITH CHECK (organization_id = get_current_organization_id());--> statement-breakpoint
CREATE POLICY "projects_organization_policy" ON "latitude"."projects" AS PERMISSIVE FOR ALL TO public USING (organization_id = get_current_organization_id()) WITH CHECK (organization_id = get_current_organization_id());--> statement-breakpoint
CREATE POLICY "scores_organization_policy" ON "latitude"."scores" AS PERMISSIVE FOR ALL TO public USING (organization_id = get_current_organization_id()) WITH CHECK (organization_id = get_current_organization_id());

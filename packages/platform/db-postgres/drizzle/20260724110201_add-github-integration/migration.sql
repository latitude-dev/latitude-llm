CREATE TABLE "latitude"."github_deliveries" (
	"id" varchar(24) PRIMARY KEY,
	"organization_id" varchar(24) NOT NULL,
	"integration_id" varchar(24) NOT NULL,
	"delivery_id" text NOT NULL,
	"event" text NOT NULL,
	"action" text,
	"repo_id" bigint,
	"status" text,
	"skip_reason" text,
	"error_category" text,
	"error_detail" text,
	"truncated" boolean DEFAULT false NOT NULL,
	"pr_number" integer,
	"merge_commit_sha" text,
	"head_sha" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "latitude"."github_deliveries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "latitude"."github_integration_details" (
	"integration_id" varchar(24) PRIMARY KEY,
	"organization_id" varchar(24) NOT NULL,
	"installation_id" bigint NOT NULL,
	"account_login" text NOT NULL,
	"account_type" text NOT NULL,
	"repository_selection" text NOT NULL,
	"suspended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "latitude"."github_integration_details" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "latitude"."github_signal_references" (
	"id" varchar(24) PRIMARY KEY,
	"organization_id" varchar(24) NOT NULL,
	"project_id" varchar(24) NOT NULL,
	"signal_id" varchar(24) NOT NULL,
	"integration_id" varchar(24) NOT NULL,
	"repo_id" bigint NOT NULL,
	"repo_full_name" text NOT NULL,
	"reference_type" text NOT NULL,
	"pr_number" integer,
	"pr_state" text,
	"commit_sha" text,
	"push_after_sha" text,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"author_login" text,
	"matched_sources" jsonb NOT NULL,
	"action" text NOT NULL,
	"action_applied_at" timestamp with time zone,
	"merged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "latitude"."github_signal_references" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "latitude"."github_sync_configs" (
	"id" varchar(24) PRIMARY KEY,
	"organization_id" varchar(24) NOT NULL,
	"project_id" varchar(24),
	"integration_id" varchar(24) NOT NULL,
	"repo_id" bigint,
	"repo_full_name" text,
	"branch" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"monitor_pull_requests" boolean,
	"monitor_commits" boolean,
	"sources" jsonb,
	"rules" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "latitude"."github_sync_configs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "github_deliveries_delivery_uq" ON "latitude"."github_deliveries" ("delivery_id");--> statement-breakpoint
CREATE INDEX "github_deliveries_organization_received_idx" ON "latitude"."github_deliveries" ("organization_id","received_at");--> statement-breakpoint
CREATE INDEX "github_deliveries_merge_commit_idx" ON "latitude"."github_deliveries" ("organization_id","repo_id","merge_commit_sha") WHERE "merge_commit_sha" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "github_deliveries_head_sha_idx" ON "latitude"."github_deliveries" ("organization_id","repo_id","head_sha") WHERE "head_sha" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "github_integration_details_organization_id_idx" ON "latitude"."github_integration_details" ("organization_id");--> statement-breakpoint
CREATE INDEX "github_integration_details_installation_idx" ON "latitude"."github_integration_details" ("installation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "github_signal_references_pr_uq" ON "latitude"."github_signal_references" ("organization_id","signal_id","repo_id","pr_number") WHERE "reference_type" = 'pull_request';--> statement-breakpoint
CREATE UNIQUE INDEX "github_signal_references_commit_uq" ON "latitude"."github_signal_references" ("organization_id","signal_id","repo_id","commit_sha") WHERE "reference_type" = 'commit';--> statement-breakpoint
CREATE INDEX "github_signal_references_signal_idx" ON "latitude"."github_signal_references" ("organization_id","signal_id");--> statement-breakpoint
CREATE INDEX "github_signal_references_repo_commit_idx" ON "latitude"."github_signal_references" ("organization_id","repo_id","commit_sha");--> statement-breakpoint
CREATE INDEX "github_signal_references_repo_pr_idx" ON "latitude"."github_signal_references" ("organization_id","repo_id","pr_number");--> statement-breakpoint
CREATE INDEX "github_sync_configs_organization_repo_idx" ON "latitude"."github_sync_configs" ("organization_id","repo_id");--> statement-breakpoint
CREATE INDEX "github_sync_configs_integration_idx" ON "latitude"."github_sync_configs" ("integration_id");--> statement-breakpoint
CREATE UNIQUE INDEX "github_sync_configs_default_uq" ON "latitude"."github_sync_configs" ("integration_id") WHERE "project_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "github_sync_configs_project_uq" ON "latitude"."github_sync_configs" ("project_id","integration_id") WHERE "project_id" IS NOT NULL;--> statement-breakpoint
CREATE POLICY "github_deliveries_organization_policy" ON "latitude"."github_deliveries" AS PERMISSIVE FOR ALL TO public USING (organization_id = get_current_organization_id()) WITH CHECK (organization_id = get_current_organization_id());--> statement-breakpoint
CREATE POLICY "github_integration_details_organization_policy" ON "latitude"."github_integration_details" AS PERMISSIVE FOR ALL TO public USING (organization_id = get_current_organization_id()) WITH CHECK (organization_id = get_current_organization_id());--> statement-breakpoint
CREATE POLICY "github_signal_references_organization_policy" ON "latitude"."github_signal_references" AS PERMISSIVE FOR ALL TO public USING (organization_id = get_current_organization_id()) WITH CHECK (organization_id = get_current_organization_id());--> statement-breakpoint
CREATE POLICY "github_sync_configs_organization_policy" ON "latitude"."github_sync_configs" AS PERMISSIVE FOR ALL TO public USING (organization_id = get_current_organization_id()) WITH CHECK (organization_id = get_current_organization_id());
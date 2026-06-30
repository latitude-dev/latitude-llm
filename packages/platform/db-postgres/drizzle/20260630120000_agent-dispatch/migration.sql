CREATE TABLE "latitude"."agent_dispatch_configs" (
	"id" varchar(24) PRIMARY KEY,
	"organization_id" varchar(24) NOT NULL,
	"project_id" varchar(24) NOT NULL,
	"integration_id" varchar(24) NOT NULL,
	"kind" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"triggers" jsonb NOT NULL,
	"target" jsonb NOT NULL,
	"prompt_template" text,
	"guardrails" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "latitude"."agent_dispatch_configs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE TABLE "latitude"."agent_dispatch_credentials" (
	"integration_id" varchar(24) PRIMARY KEY,
	"organization_id" varchar(24) NOT NULL,
	"cursor_api_key" text,
	"claude_routine_token" text,
	"linear_api_key" text,
	"webhook_secret" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "latitude"."agent_dispatch_credentials" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE TABLE "latitude"."agent_dispatches" (
	"id" varchar(24) PRIMARY KEY,
	"organization_id" varchar(24) NOT NULL,
	"project_id" varchar(24) NOT NULL,
	"config_id" varchar(24) NOT NULL,
	"idempotency_key" text NOT NULL,
	"trigger" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dispatched_at" timestamp with time zone,
	"external_agent_id" text,
	"external_run_id" text,
	"external_url" text,
	"status" text NOT NULL,
	"error_category" text,
	"error_detail" text
);
--> statement-breakpoint
ALTER TABLE "latitude"."agent_dispatches" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE INDEX "agent_dispatch_configs_project_idx" ON "latitude"."agent_dispatch_configs" ("project_id");
--> statement-breakpoint
CREATE INDEX "agent_dispatch_configs_integration_idx" ON "latitude"."agent_dispatch_configs" ("integration_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "agent_dispatches_idempotency_uq" ON "latitude"."agent_dispatches" ("organization_id","idempotency_key");
--> statement-breakpoint
CREATE INDEX "agent_dispatches_project_idx" ON "latitude"."agent_dispatches" ("project_id");
--> statement-breakpoint
CREATE INDEX "agent_dispatches_config_idx" ON "latitude"."agent_dispatches" ("config_id");
--> statement-breakpoint
CREATE POLICY "agent_dispatch_configs_organization_policy" ON "latitude"."agent_dispatch_configs" AS PERMISSIVE FOR ALL TO public USING (organization_id = get_current_organization_id()) WITH CHECK (organization_id = get_current_organization_id());
--> statement-breakpoint
CREATE POLICY "agent_dispatch_credentials_organization_policy" ON "latitude"."agent_dispatch_credentials" AS PERMISSIVE FOR ALL TO public USING (organization_id = get_current_organization_id()) WITH CHECK (organization_id = get_current_organization_id());
--> statement-breakpoint
CREATE POLICY "agent_dispatches_organization_policy" ON "latitude"."agent_dispatches" AS PERMISSIVE FOR ALL TO public USING (organization_id = get_current_organization_id()) WITH CHECK (organization_id = get_current_organization_id());

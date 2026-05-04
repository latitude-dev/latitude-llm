CREATE TABLE "latitude"."billing_overrides" (
	"id" varchar(24) PRIMARY KEY,
	"organization_id" varchar(24) NOT NULL UNIQUE,
	"plan" text NOT NULL,
	"included_credits" integer,
	"retention_days" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "latitude"."billing_overrides" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "latitude"."billing_usage_events" (
	"id" varchar(24) PRIMARY KEY,
	"organization_id" varchar(24) NOT NULL,
	"project_id" varchar(24) NOT NULL,
	"action" text NOT NULL,
	"credits" integer NOT NULL,
	"idempotency_key" text NOT NULL UNIQUE,
	"trace_id" varchar(32),
	"metadata" text,
	"happened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"billing_period_start" timestamp with time zone NOT NULL,
	"billing_period_end" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "latitude"."billing_usage_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "latitude"."billing_usage_periods" (
	"id" varchar(24) PRIMARY KEY,
	"organization_id" varchar(24) NOT NULL,
	"plan_slug" varchar(50) NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"included_credits" integer DEFAULT 0 NOT NULL,
	"consumed_credits" integer DEFAULT 0 NOT NULL,
	"overage_credits" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "latitude"."billing_usage_periods" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "billing_overrides_organization_policy" ON "latitude"."billing_overrides" AS PERMISSIVE FOR ALL TO public USING (organization_id = get_current_organization_id()) WITH CHECK (organization_id = get_current_organization_id());--> statement-breakpoint
CREATE POLICY "billing_usage_events_organization_policy" ON "latitude"."billing_usage_events" AS PERMISSIVE FOR ALL TO public USING (organization_id = get_current_organization_id()) WITH CHECK (organization_id = get_current_organization_id());--> statement-breakpoint
CREATE POLICY "billing_usage_periods_organization_policy" ON "latitude"."billing_usage_periods" AS PERMISSIVE FOR ALL TO public USING (organization_id = get_current_organization_id()) WITH CHECK (organization_id = get_current_organization_id());
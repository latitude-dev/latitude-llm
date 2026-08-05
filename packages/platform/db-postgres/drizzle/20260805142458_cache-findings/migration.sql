CREATE TABLE "latitude"."cache_findings" (
	"id" varchar(24) PRIMARY KEY,
	"organization_id" varchar(24) NOT NULL,
	"project_id" varchar(24) NOT NULL,
	"signal_id" varchar(24) NOT NULL,
	"fingerprint" varchar(200) NOT NULL,
	"provider" varchar(128) NOT NULL,
	"model" varchar(256) NOT NULL,
	"state" varchar(32) NOT NULL,
	"urgency" varchar(32),
	"actual_rate" double precision NOT NULL,
	"break_even_rate" double precision NOT NULL,
	"ceiling_rate" double precision NOT NULL,
	"modeled_savings_microcents" bigint NOT NULL,
	"calls" bigint NOT NULL,
	"spend_microcents" bigint NOT NULL,
	"cache_lifetime_seconds" integer NOT NULL,
	"first_observed_at" timestamp with time zone NOT NULL,
	"last_observed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "latitude"."cache_findings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "cache_findings_unique_fingerprint_idx" ON "latitude"."cache_findings" ("organization_id","project_id","fingerprint");--> statement-breakpoint
CREATE INDEX "cache_findings_signal_idx" ON "latitude"."cache_findings" ("organization_id","signal_id");--> statement-breakpoint
CREATE POLICY "cache_findings_organization_policy" ON "latitude"."cache_findings" AS PERMISSIVE FOR ALL TO public USING (organization_id = get_current_organization_id()) WITH CHECK (organization_id = get_current_organization_id());
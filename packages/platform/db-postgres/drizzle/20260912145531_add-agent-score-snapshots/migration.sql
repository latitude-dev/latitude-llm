CREATE TABLE "latitude"."agent_score_snapshots" (
	"id" varchar(24) PRIMARY KEY,
	"organization_id" varchar(24) NOT NULL,
	"project_id" varchar(24) NOT NULL,
	"date" date NOT NULL,
	"scoring_version" varchar(160) NOT NULL,
	"window_days" integer NOT NULL,
	"eligible_session_count" integer NOT NULL,
	"score" double precision NOT NULL,
	"score_lower" double precision NOT NULL,
	"score_upper" double precision NOT NULL,
	"outcome" double precision NOT NULL,
	"outcome_lower" double precision NOT NULL,
	"outcome_upper" double precision NOT NULL,
	"reliability" double precision NOT NULL,
	"reliability_lower" double precision NOT NULL,
	"reliability_upper" double precision NOT NULL,
	"cost" double precision NOT NULL,
	"cost_lower" double precision NOT NULL,
	"cost_upper" double precision NOT NULL,
	"speed" double precision NOT NULL,
	"speed_lower" double precision NOT NULL,
	"speed_upper" double precision NOT NULL,
	"safety" double precision NOT NULL,
	"safety_lower" double precision NOT NULL,
	"safety_upper" double precision NOT NULL,
	"policy_cap" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "latitude"."agent_score_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_score_snapshots_project_date_idx" ON "latitude"."agent_score_snapshots" ("organization_id","project_id","date");--> statement-breakpoint
CREATE POLICY "agent_score_snapshots_organization_policy" ON "latitude"."agent_score_snapshots" AS PERMISSIVE FOR ALL TO public USING (organization_id = get_current_organization_id()) WITH CHECK (organization_id = get_current_organization_id());
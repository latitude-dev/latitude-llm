CREATE TABLE "latitude"."agent_messages" (
	"id" varchar(24) PRIMARY KEY,
	"organization_id" varchar(24) NOT NULL,
	"session_id" varchar(24) NOT NULL,
	"seq" integer NOT NULL,
	"role" varchar(16) NOT NULL,
	"parts" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_messages_unique_seq_idx" UNIQUE("organization_id","session_id","seq")
);
--> statement-breakpoint
ALTER TABLE "latitude"."agent_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "latitude"."agent_sessions" (
	"id" varchar(24) PRIMARY KEY,
	"organization_id" varchar(24) NOT NULL,
	"user_id" varchar(24) NOT NULL,
	"project_id" varchar(24),
	"title" varchar(256),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "latitude"."agent_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "agent_sessions_org_user_idx" ON "latitude"."agent_sessions" ("organization_id","user_id","updated_at");--> statement-breakpoint
CREATE POLICY "agent_messages_organization_policy" ON "latitude"."agent_messages" AS PERMISSIVE FOR ALL TO public USING (organization_id = get_current_organization_id()) WITH CHECK (organization_id = get_current_organization_id());--> statement-breakpoint
CREATE POLICY "agent_sessions_organization_policy" ON "latitude"."agent_sessions" AS PERMISSIVE FOR ALL TO public USING (organization_id = get_current_organization_id()) WITH CHECK (organization_id = get_current_organization_id());
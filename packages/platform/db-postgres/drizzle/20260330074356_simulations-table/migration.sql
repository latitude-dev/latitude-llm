CREATE TABLE "latitude"."simulations" (
	"id" varchar(24) PRIMARY KEY,
	"organization_id" varchar(24) NOT NULL,
	"project_id" varchar(24) NOT NULL,
	"name" varchar(128) NOT NULL,
	"dataset" varchar(24) NOT NULL,
	"evaluations" varchar(128)[] NOT NULL,
	"passed" boolean NOT NULL,
	"errored" boolean NOT NULL,
	"metadata" jsonb NOT NULL,
	"error" text,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "latitude"."simulations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "simulations_project_created_at_idx" ON "latitude"."simulations" ("organization_id","project_id","created_at");--> statement-breakpoint
CREATE POLICY "simulations_organization_policy" ON "latitude"."simulations" AS PERMISSIVE FOR ALL TO public USING (organization_id = get_current_organization_id()) WITH CHECK (organization_id = get_current_organization_id());
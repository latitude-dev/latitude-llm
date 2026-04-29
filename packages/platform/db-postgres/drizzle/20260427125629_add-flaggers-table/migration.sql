CREATE TABLE "latitude"."flaggers" (
	"id" varchar(24) PRIMARY KEY,
	"organization_id" varchar(24) NOT NULL,
	"project_id" varchar(24) NOT NULL,
	"slug" varchar(64) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"sampling" integer DEFAULT 10 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flaggers_unique_slug_per_project_idx" UNIQUE NULLS NOT DISTINCT("organization_id","project_id","slug")
);
--> statement-breakpoint
ALTER TABLE "latitude"."flaggers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP INDEX "latitude"."annotation_queues_project_system_slug_idx";--> statement-breakpoint
CREATE INDEX "flaggers_project_list_idx" ON "latitude"."flaggers" ("organization_id","project_id");--> statement-breakpoint
CREATE POLICY "flaggers_organization_policy" ON "latitude"."flaggers" AS PERMISSIVE FOR ALL TO public USING (organization_id = get_current_organization_id()) WITH CHECK (organization_id = get_current_organization_id());
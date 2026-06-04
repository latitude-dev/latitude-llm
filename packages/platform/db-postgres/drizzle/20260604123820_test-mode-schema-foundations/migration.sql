CREATE TABLE "latitude"."sandboxes" (
	"id" varchar(24) PRIMARY KEY,
	"organization_id" varchar(24) NOT NULL UNIQUE,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" varchar(24) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "latitude"."sandboxes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "latitude"."organizations" ADD COLUMN "parent_org_id" varchar(24);--> statement-breakpoint
ALTER TABLE "latitude"."projects" ADD COLUMN "linked_project_id" varchar(24);--> statement-breakpoint
CREATE INDEX "organizations_parent_org_id_idx" ON "latitude"."organizations" ("parent_org_id");--> statement-breakpoint
CREATE INDEX "projects_linked_project_id_idx" ON "latitude"."projects" ("linked_project_id");--> statement-breakpoint
CREATE INDEX "sandboxes_status_last_activity_at_idx" ON "latitude"."sandboxes" ("status","last_activity_at");--> statement-breakpoint
CREATE INDEX "sandboxes_created_by_user_id_idx" ON "latitude"."sandboxes" ("created_by_user_id");--> statement-breakpoint
CREATE POLICY "sandboxes_organization_policy" ON "latitude"."sandboxes" AS PERMISSIVE FOR ALL TO public USING (organization_id = get_current_organization_id()) WITH CHECK (organization_id = get_current_organization_id());
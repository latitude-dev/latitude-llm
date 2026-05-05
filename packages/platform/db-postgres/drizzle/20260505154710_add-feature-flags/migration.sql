CREATE TABLE "latitude"."feature_flags" (
	"id" varchar(24) PRIMARY KEY,
	"identifier" varchar(128) NOT NULL UNIQUE,
	"name" varchar(256),
	"description" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "latitude"."organization_feature_flags" (
	"id" varchar(24) PRIMARY KEY,
	"organization_id" varchar(24) NOT NULL,
	"feature_flag_id" varchar(24) NOT NULL,
	"enabled_by_admin_user_id" varchar(24) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_feature_flags_unique_org_flag_idx" UNIQUE("organization_id","feature_flag_id")
);
--> statement-breakpoint
ALTER TABLE "latitude"."organization_feature_flags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "feature_flags_identifier_idx" ON "latitude"."feature_flags" ("identifier");--> statement-breakpoint
CREATE INDEX "organization_feature_flags_organization_id_idx" ON "latitude"."organization_feature_flags" ("organization_id");--> statement-breakpoint
CREATE INDEX "organization_feature_flags_feature_flag_id_idx" ON "latitude"."organization_feature_flags" ("feature_flag_id");--> statement-breakpoint
CREATE POLICY "organization_feature_flags_organization_policy" ON "latitude"."organization_feature_flags" AS PERMISSIVE FOR ALL TO public USING (organization_id = get_current_organization_id()) WITH CHECK (organization_id = get_current_organization_id());
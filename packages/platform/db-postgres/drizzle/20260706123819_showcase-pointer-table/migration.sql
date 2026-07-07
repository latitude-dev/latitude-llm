CREATE TABLE "latitude"."showcase" (
	"id" integer PRIMARY KEY DEFAULT 1,
	"organization_id" varchar(24) NOT NULL,
	"current_project_id" varchar(24),
	"next_project_id" varchar(24),
	"next_state" varchar(16),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "showcase_singleton_check" CHECK ("id" = 1)
);
--> statement-breakpoint
-- System/config table: no RLS policy (it stores an org id, it isn't org-scoped
-- data). The runtime user reads/updates the singleton row directly; inserts run
-- via the admin (superuser) connection (backoffice create), so latitude_app
-- gets SELECT/UPDATE only. The REVOKE is required because
-- 20260310090909_setup-runtime-db-user granted INSERT/DELETE on all latitude
-- tables to latitude_app via ALTER DEFAULT PRIVILEGES.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'latitude_app') THEN
    GRANT SELECT, UPDATE ON TABLE "latitude"."showcase" TO latitude_app;
    REVOKE INSERT, DELETE ON TABLE "latitude"."showcase" FROM latitude_app;
  END IF;
END $$;

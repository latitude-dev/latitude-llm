DO $$ BEGIN
 CREATE TYPE "latitude"."k8s_app_status" AS ENUM('pending', 'deploying', 'deployed', 'failed', 'deleting', 'deleted');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TYPE "latitude"."integration_types" ADD VALUE 'mcp_server';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "latitude"."mcp_servers" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"unique_name" text NOT NULL,
	"workspace_id" bigint NOT NULL,
	"author_id" text NOT NULL,
	"command" text NOT NULL,
	"environment_variables" text,
	"status" "latitude"."k8s_app_status" NOT NULL,
	"deployed_at" timestamp,
	"last_attempt_at" timestamp,
	"namespace" text NOT NULL,
	"k8s_manifest" text NOT NULL,
	"endpoint" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "latitude"."integrations" ADD COLUMN "mcp_server_id" bigint;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."mcp_servers" ADD CONSTRAINT "mcp_servers_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "latitude"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."mcp_servers" ADD CONSTRAINT "mcp_servers_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "latitude"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mcp_servers_workspace_id_idx" ON "latitude"."mcp_servers" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mcp_servers_author_id_idx" ON "latitude"."mcp_servers" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mcp_servers_status_idx" ON "latitude"."mcp_servers" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mcp_servers_unique_name_idx" ON "latitude"."mcp_servers" USING btree ("unique_name");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."integrations" ADD CONSTRAINT "integrations_mcp_server_id_mcp_servers_id_fk" FOREIGN KEY ("mcp_server_id") REFERENCES "latitude"."mcp_servers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

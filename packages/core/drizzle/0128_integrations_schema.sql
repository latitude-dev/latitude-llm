DO $$ BEGIN
 CREATE TYPE "latitude"."integration_types" AS ENUM('custom_mcp');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "latitude"."integrations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" varchar NOT NULL,
	"integration_type" "latitude"."integration_types" NOT NULL,
	"configuration" jsonb,
	"workspace_id" bigint NOT NULL,
	"author_id" varchar NOT NULL,
	"last_used_at" timestamp,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "integrations_name_workspace_id_deleted_at_unique" UNIQUE NULLS NOT DISTINCT("name","workspace_id","deleted_at")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."integrations" ADD CONSTRAINT "integrations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "latitude"."workspaces"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."integrations" ADD CONSTRAINT "integrations_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "latitude"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integrations_workspace_id_idx" ON "latitude"."integrations" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integrations_name_workspace_id_deleted_at_index" ON "latitude"."integrations" USING btree ("name","workspace_id","deleted_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integrations_user_id_idx" ON "latitude"."integrations" USING btree ("author_id");
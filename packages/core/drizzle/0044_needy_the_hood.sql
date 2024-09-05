CREATE TABLE IF NOT EXISTS "latitude"."datasets" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" varchar(256) NOT NULL,
	"csv_delimiter" varchar(256) NOT NULL,
	"workspace_id" bigint NOT NULL,
	"author_id" text,
	"file_key" varchar(256) NOT NULL,
	"file_metadata" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."datasets" ADD CONSTRAINT "datasets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "latitude"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."datasets" ADD CONSTRAINT "datasets_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "latitude"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "datasets_workspace_idx" ON "latitude"."datasets" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "datasets_author_idx" ON "latitude"."datasets" USING btree ("author_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "datasets_workspace_id_name_index" ON "latitude"."datasets" USING btree ("workspace_id","name");
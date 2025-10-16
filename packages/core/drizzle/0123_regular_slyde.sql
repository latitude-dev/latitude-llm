CREATE TABLE IF NOT EXISTS "latitude"."datasets_v2" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" varchar(256) NOT NULL,
	"workspace_id" bigint NOT NULL,
	"author_id" text,
	"tags" varchar(255)[] DEFAULT '{}'::varchar[] NOT NULL,
	"columns" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "latitude"."dataset_rows" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"workspace_id" bigint NOT NULL,
	"dataset_id" bigserial NOT NULL,
	"row_data" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."datasets_v2" ADD CONSTRAINT "datasets_v2_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "latitude"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."datasets_v2" ADD CONSTRAINT "datasets_v2_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "latitude"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."dataset_rows" ADD CONSTRAINT "dataset_rows_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "latitude"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."dataset_rows" ADD CONSTRAINT "dataset_rows_dataset_id_datasets_v2_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "latitude"."datasets_v2"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "datasets_table_workspace_idx" ON "latitude"."datasets_v2" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "datasets_table_author_idx" ON "latitude"."datasets_v2" USING btree ("author_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "datasets_v2_workspace_id_name_index" ON "latitude"."datasets_v2" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dataset_row_workspace_idx" ON "latitude"."dataset_rows" USING btree ("workspace_id");
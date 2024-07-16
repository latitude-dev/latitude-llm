DO $$ BEGIN
 CREATE TYPE "latitude"."document_type" AS ENUM('document', 'folder');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "latitude"."projects" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" varchar(256) NOT NULL,
	"workspace_id" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "latitude"."commits" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"next_commit_id" bigint,
	"title" varchar(256),
	"description" text,
	"project_id" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "commits_uuid_unique" UNIQUE("uuid")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "latitude"."document_snapshots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"commit_id" bigint NOT NULL,
	"document_version_id" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "latitude"."document_versions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" varchar NOT NULL,
	"document_type" "latitude"."document_type" DEFAULT 'document' NOT NULL,
	"content" text,
	"hash" varchar,
	"deleted_at" timestamp,
	"document_uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"parent_id" bigint,
	"commit_id" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."projects" ADD CONSTRAINT "projects_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "latitude"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."commits" ADD CONSTRAINT "commits_next_commit_id_commits_id_fk" FOREIGN KEY ("next_commit_id") REFERENCES "latitude"."commits"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."commits" ADD CONSTRAINT "commits_project_id_workspaces_id_fk" FOREIGN KEY ("project_id") REFERENCES "latitude"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."document_snapshots" ADD CONSTRAINT "document_snapshots_commit_id_commits_id_fk" FOREIGN KEY ("commit_id") REFERENCES "latitude"."commits"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."document_snapshots" ADD CONSTRAINT "document_snapshots_document_version_id_document_versions_id_fk" FOREIGN KEY ("document_version_id") REFERENCES "latitude"."document_versions"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."document_versions" ADD CONSTRAINT "document_versions_parent_id_document_versions_id_fk" FOREIGN KEY ("parent_id") REFERENCES "latitude"."document_versions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."document_versions" ADD CONSTRAINT "document_versions_commit_id_commits_id_fk" FOREIGN KEY ("commit_id") REFERENCES "latitude"."commits"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workspace_idx" ON "latitude"."projects" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "commit_next_commit_idx" ON "latitude"."commits" USING btree ("next_commit_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prompt_commit_idx" ON "latitude"."document_snapshots" USING btree ("commit_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_snapshot_document_version_idx" ON "latitude"."document_snapshots" USING btree ("document_version_id");
CREATE SCHEMA "latitude";
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "latitude"."commits" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"next_commit_id" bigint,
	"title" varchar(256) NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "commits_uuid_unique" UNIQUE("uuid")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "latitude"."prompt_snapshots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"commit_id" bigint NOT NULL,
	"prompt_version_id" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "latitude"."prompt_versions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"prompt_uuid" uuid NOT NULL,
	"name" varchar NOT NULL,
	"path" varchar NOT NULL,
	"content" text NOT NULL,
	"hash" varchar NOT NULL,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "prompt_versions_path_unique" UNIQUE("path")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."commits" ADD CONSTRAINT "commits_next_commit_id_commits_id_fk" FOREIGN KEY ("next_commit_id") REFERENCES "latitude"."commits"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."prompt_snapshots" ADD CONSTRAINT "prompt_snapshots_commit_id_commits_id_fk" FOREIGN KEY ("commit_id") REFERENCES "latitude"."commits"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."prompt_snapshots" ADD CONSTRAINT "prompt_snapshots_prompt_version_id_prompt_versions_id_fk" FOREIGN KEY ("prompt_version_id") REFERENCES "latitude"."prompt_versions"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prompt_commit_idx" ON "latitude"."prompt_snapshots" USING btree ("commit_id");
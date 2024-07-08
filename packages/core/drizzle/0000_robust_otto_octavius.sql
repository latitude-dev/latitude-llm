CREATE SCHEMA "latitude";
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "latitude"."accounts" (
	"userId" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "latitude"."api_keys" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"uuid" uuid NOT NULL,
	"workspace_id" bigint NOT NULL,
	"name" varchar(256),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "api_keys_uuid_unique" UNIQUE("uuid")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "latitude"."commits" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"next_commit_id" bigint,
	"title" varchar(256) NOT NULL,
	"description" text,
	"author_id" text NOT NULL,
	"workspace_id" bigserial NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "commits_uuid_unique" UNIQUE("uuid")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "latitude"."convos" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"content" jsonb,
	"prompt_version_id" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "convos_uuid_unique" UNIQUE("uuid")
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
	"commit_id" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "prompt_versions_path_unique" UNIQUE("path")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "latitude"."sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"expires" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "latitude"."users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"email_verified" timestamp,
	"image" text,
	"encrypted_password" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "latitude"."workspaces" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" varchar(256) NOT NULL,
	"creator_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."accounts" ADD CONSTRAINT "accounts_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "latitude"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."api_keys" ADD CONSTRAINT "api_keys_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "latitude"."workspaces"("id") ON DELETE no action ON UPDATE no action;
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
 ALTER TABLE "latitude"."commits" ADD CONSTRAINT "commits_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "latitude"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."commits" ADD CONSTRAINT "commits_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "latitude"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."convos" ADD CONSTRAINT "convos_prompt_version_id_prompt_versions_id_fk" FOREIGN KEY ("prompt_version_id") REFERENCES "latitude"."prompt_versions"("id") ON DELETE cascade ON UPDATE no action;
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
DO $$ BEGIN
 ALTER TABLE "latitude"."prompt_versions" ADD CONSTRAINT "prompt_versions_commit_id_commits_id_fk" FOREIGN KEY ("commit_id") REFERENCES "latitude"."commits"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."sessions" ADD CONSTRAINT "sessions_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "latitude"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."workspaces" ADD CONSTRAINT "workspaces_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "latitude"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workspace_id_idx" ON "latitude"."api_keys" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "commit_next_commit_idx" ON "latitude"."commits" USING btree ("next_commit_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "convo_prompt_version_idx" ON "latitude"."convos" USING btree ("prompt_version_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prompt_commit_idx" ON "latitude"."prompt_snapshots" USING btree ("commit_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prompt_snapshot_prompt_version_idx" ON "latitude"."prompt_snapshots" USING btree ("prompt_version_id");
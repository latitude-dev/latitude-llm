CREATE TABLE IF NOT EXISTS "latitude"."spans" (
	"id" varchar(16) PRIMARY KEY NOT NULL,
	"workspace_id" bigint NOT NULL,
	"api_key_id" bigint NOT NULL,
	"trace_id" varchar(32) NOT NULL,
	"segment_id" varchar(16),
	"parent_id" varchar(16),
	"external_id" varchar(128),
	"name" varchar(128) NOT NULL,
	"kind" varchar(128) NOT NULL,
	"source" varchar(128) NOT NULL,
	"type" varchar(128) NOT NULL,
	"status_code" varchar(128) NOT NULL,
	"status_message" varchar(1024),
	"duration" bigint NOT NULL,
	"started_at" timestamp NOT NULL,
	"ended_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "latitude"."segments" (
	"id" varchar(16) PRIMARY KEY NOT NULL,
	"workspace_id" bigint NOT NULL,
	"api_key_id" bigint NOT NULL,
	"trace_id" varchar(32) NOT NULL,
	"parent_id" varchar(16),
	"external_id" varchar(128),
	"name" varchar(128) NOT NULL,
	"source" varchar(128) NOT NULL,
	"type" varchar(128) NOT NULL,
	"status_code" varchar(128) NOT NULL,
	"status_message" varchar(1024),
	"commit_uuid" uuid,
	"document_uuid" uuid,
	"document_type" "latitude"."document_type_enum",
	"experiment_uuid" uuid,
	"prompt_hash" varchar(64),
	"provider" varchar(128),
	"model" varchar(128),
	"tokens" bigint,
	"cost" bigint,
	"duration" bigint NOT NULL,
	"started_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."spans" ADD CONSTRAINT "spans_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "latitude"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."spans" ADD CONSTRAINT "spans_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "latitude"."api_keys"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."segments" ADD CONSTRAINT "segments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "latitude"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."segments" ADD CONSTRAINT "segments_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "latitude"."api_keys"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."segments" ADD CONSTRAINT "segments_commit_uuid_commits_uuid_fk" FOREIGN KEY ("commit_uuid") REFERENCES "latitude"."commits"("uuid") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."segments" ADD CONSTRAINT "segments_experiment_uuid_experiments_uuid_fk" FOREIGN KEY ("experiment_uuid") REFERENCES "latitude"."experiments"("uuid") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spans_workspace_id_idx" ON "latitude"."spans" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spans_api_key_id_idx" ON "latitude"."spans" USING btree ("api_key_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spans_trace_id_idx" ON "latitude"."spans" USING btree ("trace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spans_segment_id_idx" ON "latitude"."spans" USING btree ("segment_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spans_parent_id_idx" ON "latitude"."spans" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spans_started_at_idx" ON "latitude"."spans" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spans_ended_at_idx" ON "latitude"."spans" USING btree ("ended_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "segments_workspace_id_idx" ON "latitude"."segments" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "segments_api_key_id_idx" ON "latitude"."segments" USING btree ("api_key_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "segments_trace_id_idx" ON "latitude"."segments" USING btree ("trace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "segments_parent_id_idx" ON "latitude"."segments" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "segments_external_id_trgm_idx" ON "latitude"."segments" USING gin ("external_id" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "segments_commit_uuid_idx" ON "latitude"."segments" USING btree ("commit_uuid");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "segments_document_uuid_idx" ON "latitude"."segments" USING btree ("document_uuid");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "segments_experiment_uuid_idx" ON "latitude"."segments" USING btree ("experiment_uuid");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "segments_prompt_hash_idx" ON "latitude"."segments" USING btree ("prompt_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "segments_provider_idx" ON "latitude"."segments" USING btree ("provider");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "segments_model_idx" ON "latitude"."segments" USING btree ("model");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "segments_started_at_idx" ON "latitude"."segments" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "segments_updated_at_idx" ON "latitude"."segments" USING btree ("updated_at");
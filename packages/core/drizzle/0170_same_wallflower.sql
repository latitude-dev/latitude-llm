CREATE TABLE IF NOT EXISTS "latitude"."spans" (
	"id" varchar(16) PRIMARY KEY NOT NULL,
	"workspace_id" bigint NOT NULL,
	"api_key_id" bigint NOT NULL,
	"parent_id" varchar(16),
	"trace_id" varchar(32) NOT NULL,
	"external_id" varchar(128),
	"name" varchar(256) NOT NULL,
	"kind" varchar(128) NOT NULL,
	"source" varchar(128) NOT NULL,
	"type" varchar(128) NOT NULL,
	"status_code" varchar(128) NOT NULL,
	"status_message" varchar(1024),
	"commit_id" bigint,
	"document_uuid" uuid,
	"evaluation_uuid" uuid,
	"experiment_id" bigint,
	"prompt_hash" varchar(64),
	"provider_id" bigint,
	"model" varchar(128),
	"tokens" bigint,
	"cost" bigint,
	"duration" bigint NOT NULL,
	"started_at" timestamp NOT NULL,
	"ended_at" timestamp NOT NULL,
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
 ALTER TABLE "latitude"."spans" ADD CONSTRAINT "spans_commit_id_commits_id_fk" FOREIGN KEY ("commit_id") REFERENCES "latitude"."commits"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."spans" ADD CONSTRAINT "spans_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "latitude"."experiments"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."spans" ADD CONSTRAINT "spans_provider_id_provider_api_keys_id_fk" FOREIGN KEY ("provider_id") REFERENCES "latitude"."provider_api_keys"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spans_workspace_id_idx" ON "latitude"."spans" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spans_api_key_id_idx" ON "latitude"."spans" USING btree ("api_key_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spans_parent_id_idx" ON "latitude"."spans" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spans_trace_id_idx" ON "latitude"."spans" USING btree ("trace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spans_external_id_trgm_idx" ON "latitude"."spans" USING gin ("external_id" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spans_commit_id_idx" ON "latitude"."spans" USING btree ("commit_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spans_document_uuid_idx" ON "latitude"."spans" USING btree ("document_uuid");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spans_evaluation_uuid_idx" ON "latitude"."spans" USING btree ("evaluation_uuid");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spans_experiment_id_idx" ON "latitude"."spans" USING btree ("experiment_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spans_prompt_hash_idx" ON "latitude"."spans" USING btree ("prompt_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spans_provider_id_idx" ON "latitude"."spans" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spans_model_idx" ON "latitude"."spans" USING btree ("model");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spans_started_at_idx" ON "latitude"."spans" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spans_ended_at_idx" ON "latitude"."spans" USING btree ("ended_at");
DO $$ BEGIN
 CREATE TYPE "latitude"."log_source" AS ENUM('playground', 'api');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "latitude"."document_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"uuid" uuid NOT NULL,
	"document_uuid" uuid NOT NULL,
	"commit_id" bigint NOT NULL,
	"resolved_content" text NOT NULL,
	"parameters" json NOT NULL,
	"custom_identifier" text,
	"duration" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "document_logs_uuid_unique" UNIQUE("uuid")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "latitude"."provider_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"uuid" uuid NOT NULL,
	"provider_id" bigint NOT NULL,
	"model" varchar,
	"config" json NOT NULL,
	"messages" json NOT NULL,
	"response_text" text,
	"tool_calls" json,
	"tokens" bigint NOT NULL,
	"duration" bigint NOT NULL,
	"document_log_id" bigint,
	"source" "latitude"."log_source" NOT NULL,
	"apiKeyId" bigint,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "provider_logs_uuid_unique" UNIQUE("uuid")
);
--> statement-breakpoint
ALTER TABLE "latitude"."api_keys" ADD COLUMN "last_used_at" timestamp;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."document_logs" ADD CONSTRAINT "document_logs_commit_id_commits_id_fk" FOREIGN KEY ("commit_id") REFERENCES "latitude"."commits"("id") ON DELETE restrict ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."provider_logs" ADD CONSTRAINT "provider_logs_provider_id_provider_api_keys_id_fk" FOREIGN KEY ("provider_id") REFERENCES "latitude"."provider_api_keys"("id") ON DELETE restrict ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."provider_logs" ADD CONSTRAINT "provider_logs_document_log_id_document_logs_id_fk" FOREIGN KEY ("document_log_id") REFERENCES "latitude"."document_logs"("id") ON DELETE restrict ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."provider_logs" ADD CONSTRAINT "provider_logs_apiKeyId_api_keys_id_fk" FOREIGN KEY ("apiKeyId") REFERENCES "latitude"."api_keys"("id") ON DELETE restrict ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

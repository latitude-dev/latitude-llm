DO $$ BEGIN
 CREATE TYPE "latitude"."provider" AS ENUM('openai', 'anthropic');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "latitude"."providerApiKeys" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"uuid" uuid NOT NULL,
	"provider" "provider" NOT NULL,
	"workspace_id" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "latitude"."api_keys" RENAME COLUMN "uuid" TO "token";--> statement-breakpoint
ALTER TABLE "latitude"."api_keys" DROP CONSTRAINT "api_keys_uuid_unique";--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."providerApiKeys" ADD CONSTRAINT "providerApiKeys_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "latitude"."workspaces"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provider_apikeys_workspace_id_idx" ON "latitude"."providerApiKeys" USING btree ("workspace_id");--> statement-breakpoint
ALTER TABLE "latitude"."api_keys" ADD CONSTRAINT "api_keys_token_unique" UNIQUE("token");
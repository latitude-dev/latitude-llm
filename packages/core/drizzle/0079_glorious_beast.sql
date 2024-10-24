DROP INDEX IF EXISTS "provider_apikeys_name_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "provider_apikeys_token_provider_unique";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "provider_apikeys_name_idx" ON "latitude"."provider_api_keys" USING btree ("name","workspace_id","deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "provider_apikeys_token_provider_unique" ON "latitude"."provider_api_keys" USING btree ("token","provider","workspace_id","deleted_at");
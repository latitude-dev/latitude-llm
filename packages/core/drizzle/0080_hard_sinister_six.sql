DROP INDEX IF EXISTS "provider_apikeys_name_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "provider_apikeys_token_provider_unique";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provider_api_keys_name_workspace_id_deleted_at_index" ON "latitude"."provider_api_keys" USING btree ("name","workspace_id","deleted_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provider_api_keys_token_provider_workspace_id_deleted_at_index" ON "latitude"."provider_api_keys" USING btree ("token","provider","workspace_id","deleted_at");--> statement-breakpoint
ALTER TABLE "latitude"."provider_api_keys" ADD CONSTRAINT "provider_api_keys_name_workspace_id_deleted_at_unique" UNIQUE NULLS NOT DISTINCT("name","workspace_id","deleted_at");--> statement-breakpoint
ALTER TABLE "latitude"."provider_api_keys" ADD CONSTRAINT "provider_api_keys_token_provider_workspace_id_deleted_at_unique" UNIQUE NULLS NOT DISTINCT("token","provider","workspace_id","deleted_at");
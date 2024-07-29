ALTER TABLE "latitude"."providerApiKeys" RENAME TO "provider_api_keys";--> statement-breakpoint
ALTER TABLE "latitude"."provider_api_keys" DROP CONSTRAINT "providerApiKeys_workspace_id_workspaces_id_fk";
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."provider_api_keys" ADD CONSTRAINT "provider_api_keys_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "latitude"."workspaces"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

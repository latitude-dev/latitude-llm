ALTER TABLE "latitude"."workspaces" ADD COLUMN "default_provider_id" bigint;--> statement-breakpoint
ALTER TABLE "latitude"."provider_api_keys" ADD COLUMN "default_model" varchar;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."workspaces" ADD CONSTRAINT "workspaces_default_provider_id_provider_api_keys_id_fk" FOREIGN KEY ("default_provider_id") REFERENCES "latitude"."provider_api_keys"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

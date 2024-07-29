ALTER TABLE "latitude"."provider_api_keys" ADD COLUMN "author_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."provider_api_keys" ADD COLUMN "last_used_at" timestamp;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."provider_api_keys" ADD CONSTRAINT "provider_api_keys_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "latitude"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provider_apikeys_user_id_idx" ON "latitude"."provider_api_keys" USING btree ("author_id");
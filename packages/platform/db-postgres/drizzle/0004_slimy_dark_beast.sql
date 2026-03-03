ALTER TABLE "latitude"."api_keys" ADD COLUMN "token_hash" text NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."api_keys" ADD CONSTRAINT "api_keys_token_hash_unique" UNIQUE("token_hash");

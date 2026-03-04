ALTER TABLE "latitude"."api_keys" DROP CONSTRAINT "api_keys_token_key";--> statement-breakpoint
ALTER TABLE "latitude"."api_keys" ADD COLUMN "token_hash" text NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."api_keys" ADD CONSTRAINT "api_keys_token_hash_key" UNIQUE("token_hash");

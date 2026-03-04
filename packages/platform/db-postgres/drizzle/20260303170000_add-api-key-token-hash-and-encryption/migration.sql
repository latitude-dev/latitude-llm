-- Add token_hash column for indexed lookups.
-- Existing data backfill is intentionally omitted.

ALTER TABLE "latitude"."api_keys" ADD COLUMN "token_hash" text NOT NULL;

-- Add unique constraint on token_hash (replaces old token unique)
ALTER TABLE "latitude"."api_keys" ADD CONSTRAINT "api_keys_token_hash_unique" UNIQUE("token_hash");

-- Drop the unique constraint on the token column
-- (encrypted tokens are not deterministic due to random IVs, so uniqueness
-- is enforced via token_hash instead)
ALTER TABLE "latitude"."api_keys" DROP CONSTRAINT IF EXISTS "api_keys_token_unique";

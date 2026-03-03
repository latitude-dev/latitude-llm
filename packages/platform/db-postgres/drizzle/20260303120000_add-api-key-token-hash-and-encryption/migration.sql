-- Add token_hash column for indexed lookups without decryption.
-- The token column will now store AES-256-GCM encrypted values.

-- Step 1: Add token_hash column (nullable initially for backfill)
ALTER TABLE "latitude"."api_keys" ADD COLUMN "token_hash" text;

-- Step 2: Backfill token_hash from existing plaintext tokens using SHA-256
UPDATE "latitude"."api_keys"
SET "token_hash" = encode(sha256("token"::bytea), 'hex')
WHERE "token_hash" IS NULL;

-- Step 3: Make token_hash NOT NULL
ALTER TABLE "latitude"."api_keys" ALTER COLUMN "token_hash" SET NOT NULL;

-- Step 4: Add unique constraint on token_hash (replaces old token unique)
ALTER TABLE "latitude"."api_keys" ADD CONSTRAINT "api_keys_token_hash_unique" UNIQUE("token_hash");

-- Step 5: Drop the unique constraint on the token column
-- (encrypted tokens are not deterministic due to random IVs, so uniqueness
-- is enforced via token_hash instead)
ALTER TABLE "latitude"."api_keys" DROP CONSTRAINT IF EXISTS "api_keys_token_unique";

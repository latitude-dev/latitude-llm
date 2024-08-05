ALTER TABLE "latitude"."provider_api_keys"
  ALTER COLUMN "provider"
  SET DATA TYPE "latitude"."provider"
  USING "provider"::text::"latitude"."provider";

DROP TYPE "public"."provider";

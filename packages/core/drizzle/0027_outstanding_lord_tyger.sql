ALTER TABLE "latitude"."provider_logs" ADD COLUMN "cost" integer DEFAULT 0 NOT NULL;
ALTER TABLE "latitude"."provider_logs" ALTER COLUMN "cost" DROP DEFAULT;

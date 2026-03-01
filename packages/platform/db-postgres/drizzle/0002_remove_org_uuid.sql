ALTER TABLE "latitude"."organization" DROP COLUMN "uuid";--> statement-breakpoint
DROP INDEX IF EXISTS "organization_uuid_unique";
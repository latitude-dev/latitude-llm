ALTER TABLE "latitude"."organization" DROP CONSTRAINT "organization_uuid_unique";--> statement-breakpoint
ALTER TABLE "latitude"."projects" ADD COLUMN "slug" varchar(256) NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."organization" DROP COLUMN "uuid";
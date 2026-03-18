ALTER TABLE "latitude"."projects" ADD COLUMN "description" varchar(2048);--> statement-breakpoint
ALTER TABLE "latitude"."projects" ADD COLUMN "created_by_id" varchar(24);--> statement-breakpoint
ALTER TABLE "latitude"."api_keys" ALTER COLUMN "name" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "latitude"."api_keys" ALTER COLUMN "name" SET NOT NULL;
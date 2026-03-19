ALTER TABLE "latitude"."subscription" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."subscription" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."api_keys" ALTER COLUMN "name" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "latitude"."api_keys" ALTER COLUMN "name" SET NOT NULL;
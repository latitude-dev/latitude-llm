ALTER TABLE "latitude"."sessions" ADD COLUMN "impersonated_by" text;--> statement-breakpoint
ALTER TABLE "latitude"."users" ADD COLUMN "banned" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."users" ADD COLUMN "ban_reason" text;--> statement-breakpoint
ALTER TABLE "latitude"."users" ADD COLUMN "ban_expires" timestamp with time zone;
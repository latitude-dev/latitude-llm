ALTER TABLE "latitude"."monitors" ADD COLUMN "target_stream" varchar(32);--> statement-breakpoint
ALTER TABLE "latitude"."monitors" ADD COLUMN "target_filter_set" jsonb;--> statement-breakpoint
ALTER TABLE "latitude"."monitors" ADD COLUMN "target_query" text;--> statement-breakpoint
ALTER TABLE "latitude"."monitors" ADD COLUMN "target_saved_search_id" varchar(24);--> statement-breakpoint
ALTER TABLE "latitude"."monitors" ADD COLUMN "metric" jsonb;
ALTER TABLE "latitude"."users" ADD COLUMN "ai_usage_stage" varchar(128);--> statement-breakpoint
ALTER TABLE "latitude"."users" ADD COLUMN "latitude_goal" varchar(128);--> statement-breakpoint
ALTER TABLE "latitude"."users" ADD COLUMN "latitude_goal_other" text;
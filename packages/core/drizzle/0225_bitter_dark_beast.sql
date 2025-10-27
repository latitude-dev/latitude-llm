ALTER TABLE "latitude"."spans" ADD COLUMN "tokens_prompt" integer;--> statement-breakpoint
ALTER TABLE "latitude"."spans" ADD COLUMN "tokens_cached" integer;--> statement-breakpoint
ALTER TABLE "latitude"."spans" ADD COLUMN "tokens_reasoning" integer;--> statement-breakpoint
ALTER TABLE "latitude"."spans" ADD COLUMN "tokens_completion" integer;--> statement-breakpoint
ALTER TABLE "latitude"."spans" ADD COLUMN "cost" integer;
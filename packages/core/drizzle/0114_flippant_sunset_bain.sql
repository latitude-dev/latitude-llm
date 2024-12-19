ALTER TABLE "latitude"."spans" RENAME COLUMN "prompt_tokens" TO "input_tokens";--> statement-breakpoint
ALTER TABLE "latitude"."spans" RENAME COLUMN "completion_tokens" TO "output_tokens";
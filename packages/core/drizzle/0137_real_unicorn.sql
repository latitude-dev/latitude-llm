ALTER TABLE "latitude"."evaluation_results_v2" ALTER COLUMN "score" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."evaluation_results_v2" ALTER COLUMN "metadata" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."evaluation_results_v2" ADD COLUMN "error" jsonb;
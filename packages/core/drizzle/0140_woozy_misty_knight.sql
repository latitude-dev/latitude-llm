ALTER TABLE "latitude"."evaluation_results_v2" ADD COLUMN "normalized_score" bigint;--> statement-breakpoint
ALTER TABLE "latitude"."evaluation_results_v2" ADD COLUMN "has_passed" boolean;--> statement-breakpoint
ALTER TABLE "latitude"."evaluation_versions" DROP COLUMN IF EXISTS "condition";--> statement-breakpoint
ALTER TABLE "latitude"."evaluation_versions" DROP COLUMN IF EXISTS "threshold";
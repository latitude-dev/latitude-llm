ALTER TYPE "latitude"."subscription_plans" ADD VALUE 'team_v4';--> statement-breakpoint
ALTER TYPE "latitude"."subscription_plans" ADD VALUE 'scale_v1';--> statement-breakpoint
ALTER TABLE "latitude"."subscriptions" ADD COLUMN "trial_ends_at" timestamp;--> statement-breakpoint

-- Set trial_ends_at for existing hobby plan subscriptions to 2026-02-18
UPDATE latitude.subscriptions
SET trial_ends_at = '2026-02-18 00:00:00'
WHERE plan IN ('hobby_v1', 'hobby_v2', 'hobby_v3')
  AND trial_ends_at IS NULL;

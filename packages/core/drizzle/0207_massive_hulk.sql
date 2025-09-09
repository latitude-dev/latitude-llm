DELETE FROM "latitude"."claimed_rewards";--> statement-breakpoint

ALTER TABLE "latitude"."claimed_rewards" ALTER COLUMN "reward_type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "latitude"."reward_types";--> statement-breakpoint
CREATE TYPE "latitude"."reward_types" AS ENUM('x_follow', 'linkedin_follow', 'github_star', 'x_post', 'linkedin_post', 'agent_share', 'producthunt_upvote', 'referral');--> statement-breakpoint
ALTER TABLE "latitude"."claimed_rewards" ALTER COLUMN "reward_type" SET DATA TYPE "latitude"."reward_types" USING "reward_type"::"latitude"."reward_types";
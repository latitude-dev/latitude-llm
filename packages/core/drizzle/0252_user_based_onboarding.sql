ALTER TABLE "latitude"."users" ADD COLUMN "onboarding_completed_at" timestamp;--> statement-breakpoint

-- Fill the onboarding_completed_at column with the completed_at column from the workspace_onboarding table for the users in a completed workspace
UPDATE "latitude"."users"
SET "onboarding_completed_at" = "latitude"."workspace_onboarding"."completed_at"
FROM "latitude"."workspace_onboarding"
LEFT JOIN "latitude"."memberships" ON "latitude"."workspace_onboarding"."workspace_id" = "latitude"."memberships"."workspace_id"
WHERE "latitude"."users"."id" = "latitude"."memberships"."user_id"
AND "latitude"."workspace_onboarding"."completed_at" IS NOT NULL;--> statement-breakpoint

DROP TABLE "latitude"."workspace_onboarding" CASCADE;--> statement-breakpoint
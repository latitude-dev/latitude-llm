-- Move the feature flag catalog into code. The DB now stores only enablement
-- state, keyed by identifier:
--   * feature_flags drops its surrogate cuid id, name, description, archived_at.
--     `identifier` becomes the primary key.
--   * organization_feature_flags joins by identifier directly instead of by the
--     surrogate feature_flag_id. We add the new column, backfill from the join,
--     enforce NOT NULL, then drop the old column.

-- Step 1: Add identifier on organization_feature_flags as nullable so existing rows survive.
ALTER TABLE "latitude"."organization_feature_flags" ADD COLUMN "identifier" varchar(128);--> statement-breakpoint

-- Step 2: Backfill identifier from the feature_flags surrogate key.
UPDATE "latitude"."organization_feature_flags" AS ofg
SET "identifier" = ff."identifier"
FROM "latitude"."feature_flags" AS ff
WHERE ofg."feature_flag_id" = ff."id";--> statement-breakpoint

-- Step 3: Enforce NOT NULL now that every row has been backfilled.
ALTER TABLE "latitude"."organization_feature_flags" ALTER COLUMN "identifier" SET NOT NULL;--> statement-breakpoint

-- Step 4: Drop the surrogate-key join machinery.
ALTER TABLE "latitude"."organization_feature_flags" DROP CONSTRAINT "organization_feature_flags_unique_org_flag_idx";--> statement-breakpoint
DROP INDEX "latitude"."organization_feature_flags_feature_flag_id_idx";--> statement-breakpoint
ALTER TABLE "latitude"."organization_feature_flags" DROP COLUMN "feature_flag_id";--> statement-breakpoint

-- Step 5: Slim feature_flags down to identifier + enabled_for_all + timestamps,
-- with identifier as the primary key.
ALTER TABLE "latitude"."feature_flags" DROP CONSTRAINT "feature_flags_identifier_key";--> statement-breakpoint
DROP INDEX "latitude"."feature_flags_identifier_idx";--> statement-breakpoint
ALTER TABLE "latitude"."feature_flags" DROP COLUMN "id";--> statement-breakpoint
ALTER TABLE "latitude"."feature_flags" DROP COLUMN "name";--> statement-breakpoint
ALTER TABLE "latitude"."feature_flags" DROP COLUMN "description";--> statement-breakpoint
ALTER TABLE "latitude"."feature_flags" DROP COLUMN "archived_at";--> statement-breakpoint
ALTER TABLE "latitude"."feature_flags" ADD PRIMARY KEY ("identifier");--> statement-breakpoint

-- Step 6: Add the identifier-based unique constraint and index on the join table.
ALTER TABLE "latitude"."organization_feature_flags" ADD CONSTRAINT "organization_feature_flags_unique_org_identifier_idx" UNIQUE("organization_id","identifier");--> statement-breakpoint
CREATE INDEX "organization_feature_flags_identifier_idx" ON "latitude"."organization_feature_flags" ("identifier");

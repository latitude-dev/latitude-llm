-- Custom SQL migration file, put you code below! --
BEGIN;

-- Update the created_at column in the subscriptions table
UPDATE "latitude"."subscriptions"
SET created_at = "latitude"."workspaces".created_at
FROM "latitude"."workspaces"
WHERE "latitude"."subscriptions".id = "latitude"."workspaces".current_subscription_id;

COMMIT;

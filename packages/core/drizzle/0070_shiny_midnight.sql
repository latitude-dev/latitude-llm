-- Custom SQL migration file, put you code below! --
BEGIN;

-- Update the created_at column in the subscriptions table
UPDATE "latitude"."subscriptions"
SET created_at = workspaces.created_at
FROM workspaces
WHERE subscriptions.id = workspaces.current_subscription_id;

COMMIT;

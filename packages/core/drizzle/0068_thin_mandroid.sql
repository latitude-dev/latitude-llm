-- Insert a new subscription for all workspaces without a current subscription

BEGIN;
-- Identify all workspaces that do not have a current subscription assigned to
-- them and insert a new subscription for each of these workspaces
WITH new_subscriptions AS (
    INSERT INTO subscriptions (workspace_id, plan, created_at, updated_at)
    SELECT w.id, 'hobby_v1', NOW(), NOW()
    FROM workspaces w
    LEFT JOIN subscriptions s ON w.id = s.workspace_id
    WHERE w.current_subscription_id IS NULL
    RETURNING id, workspace_id
)

-- Update the current_subscription_id of each workspace to the newly created subscription
UPDATE workspaces w
SET current_subscription_id = ns.id
FROM new_subscriptions ns
WHERE w.id = ns.workspace_id;

COMMIT;

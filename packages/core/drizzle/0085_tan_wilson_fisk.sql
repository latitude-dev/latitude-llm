-- Custom SQL migration file, put you code below! --
UPDATE provider_logs
SET workspace_id = provider_api_keys.workspace_id
FROM provider_api_keys
WHERE provider_logs.provider_id = provider_api_keys.id
AND provider_logs.workspace_id IS NULL;
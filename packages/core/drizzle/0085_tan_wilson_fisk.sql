-- Custom SQL migration file, put you code below! --
UPDATE "latitude"."provider_logs"
SET workspace_id = "latitude"."provider_api_keys".workspace_id
FROM "latitude"."provider_api_keys"
WHERE "latitude"."provider_logs".provider_id = "latitude"."provider_api_keys".id
AND "latitude"."provider_logs".workspace_id IS NULL;
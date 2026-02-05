UPDATE "latitude"."evaluation_versions"
SET configuration = jsonb_set("configuration", '{trigger}', '{"target": "every"}'::jsonb)
WHERE configuration IS NOT NULL AND configuration->>'trigger' IS NULL;
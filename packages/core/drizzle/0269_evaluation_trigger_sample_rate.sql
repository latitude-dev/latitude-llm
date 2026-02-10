UPDATE "latitude"."evaluation_versions"
SET configuration = jsonb_set("configuration", '{trigger,sampleRate}', '100'::jsonb)
WHERE configuration IS NOT NULL
  AND configuration->'trigger' IS NOT NULL
  AND (configuration->'trigger'->>'sampleRate') IS NULL;

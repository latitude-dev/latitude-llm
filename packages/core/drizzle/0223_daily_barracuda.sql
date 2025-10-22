-- Custom SQL migration file, put your code below! --
UPDATE "latitude"."evaluation_versions"
SET configuration = jsonb_set("configuration", '{enableControls}', 'true'::jsonb)
WHERE type = 'human';

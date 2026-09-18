-- Replay-safe: conflicts against the (organization_id, project_id, slug) unique index, so an
-- existing row keeps the enabled state and sampling rate the project chose.
INSERT INTO "latitude"."flaggers" ("id", "organization_id", "project_id", "slug")
SELECT
    'c' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 23),
    p."organization_id",
    p."id",
    'task-failure'
FROM "latitude"."projects" p
WHERE p."deleted_at" IS NULL
ON CONFLICT ("organization_id", "project_id", "slug") DO NOTHING;

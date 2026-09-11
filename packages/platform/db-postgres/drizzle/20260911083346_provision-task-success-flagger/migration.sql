-- Backfills the `task-success` flagger row for every live project.
--
-- Flagger rows are written once, when a project is created, and nothing ever
-- re-provisions an existing project. Screening drops a slug with no row as
-- `missing-flagger` rather than falling back to defaults, so a slug that ships
-- later never runs on a project that already existed. `task-success` is the
-- only evidence source for the Agent Score's Outcome dimension, which would
-- therefore read as unmeasured on all existing projects indefinitely.
--
-- Defaults come from the column definitions (enabled, sampling 10, timestamps),
-- so a project that later turns the judge off or retunes its rate keeps that
-- choice on any re-run. The insert conflicts against the
-- (organization_id, project_id, slug) unique index and does nothing, so this is
-- safe to replay.
--
-- Ids are 24 lowercase alphanumeric characters starting with a letter, matching
-- the cuid2 shape the application generates and the length its schema validates.
INSERT INTO "latitude"."flaggers" ("id", "organization_id", "project_id", "slug")
SELECT
    'c' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 23),
    p."organization_id",
    p."id",
    'task-success'
FROM "latitude"."projects" p
WHERE p."deleted_at" IS NULL
ON CONFLICT ("organization_id", "project_id", "slug") DO NOTHING;

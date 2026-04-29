-- Custom SQL migration file, put your code below! --
-- Backfill: provision one flagger row per registered strategy slug for every existing project.
-- New projects continue to be provisioned by the worker on ProjectCreated via `provisionFlaggersUseCase`.
-- Idempotent: ON CONFLICT DO NOTHING on the (organization_id, project_id, slug) unique index.
-- Strategy slugs mirror `FLAGGER_STRATEGY_SLUGS` in @domain/flaggers; defaults match `FLAGGER_DEFAULT_ENABLED` / `FLAGGER_DEFAULT_SAMPLING`.
INSERT INTO "latitude"."flaggers" (id, organization_id, project_id, slug, enabled, sampling)
SELECT
  substr(md5(gen_random_uuid()::text), 1, 24),
  p.organization_id,
  p.id,
  s.slug,
  true,
  10
FROM "latitude"."projects" p
CROSS JOIN (VALUES
  ('frustration'),
  ('nsfw'),
  ('refusal'),
  ('laziness'),
  ('jailbreaking'),
  ('forgetting'),
  ('trashing'),
  ('tool-call-errors'),
  ('output-schema-validation'),
  ('empty-response')
) AS s(slug)
ON CONFLICT ON CONSTRAINT "flaggers_unique_slug_per_project_idx" DO NOTHING;

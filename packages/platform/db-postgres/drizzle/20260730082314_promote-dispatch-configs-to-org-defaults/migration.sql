-- Custom SQL migration file, put your code below! --
-- Backfill: promote a project override's target to the organization default that connect now seeds.
-- Triggers stay off so the promoted default cannot fan auto-dispatch out to other projects.

-- An empty target overrides the default with nothing, so clear it to inherit before promoting.
UPDATE "latitude"."agent_dispatch_configs"
SET target = NULL, updated_at = now()
WHERE project_id IS NOT NULL AND target = '{}'::jsonb;

INSERT INTO "latitude"."agent_dispatch_configs" (id, organization_id, project_id, integration_id, kind, enabled, triggers, target, guardrails)
SELECT DISTINCT ON (c.integration_id)
  substr(md5(gen_random_uuid()::text), 1, 24),
  c.organization_id,
  NULL,
  c.integration_id,
  c.kind,
  false,
  '[]'::jsonb,
  c.target,
  c.guardrails
FROM "latitude"."agent_dispatch_configs" c
JOIN "latitude"."integrations" i ON i.id = c.integration_id AND i.revoked_at IS NULL
WHERE c.project_id IS NOT NULL
  AND c.target IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "latitude"."agent_dispatch_configs" d
    WHERE d.integration_id = c.integration_id AND d.project_id IS NULL
  )
ORDER BY c.integration_id, c.updated_at DESC;

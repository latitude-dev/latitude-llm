-- Custom SQL migration file, put your code below! --
-- Backfill: connecting an integration used to store its target as a project override only, so manual
-- "Send to agent" and auto-dispatch worked in the connecting project alone. Connect now seeds the
-- organization default, so promote a target for every active integration that still lacks one.
-- Triggers stay empty and disabled: the existing project override keeps its auto-dispatch, and the rest
-- of the organization gains manual sends without silently fanning dispatches out to other projects.

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

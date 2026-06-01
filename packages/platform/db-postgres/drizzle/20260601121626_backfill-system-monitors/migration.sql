-- Custom SQL migration file, put your code below! --
-- Backfill: provision the three system issue monitors for every existing project.
-- New projects get them from the worker (`provisionSystemMonitorsUseCase`) on ProjectCreated.
--
-- Self-contained by design: slugs/names/severities/conditions are hardcoded to
-- mirror SYSTEM_MONITOR_DEFINITIONS (@domain/monitors) + SEVERITY_FOR_KIND
-- (@domain/shared). The escalating sensitivity 3 is DEFAULT_ESCALATION_SENSITIVITY.
-- All monitors are unmuted; existing projects.settings.notifications toggles are
-- deliberately NOT consulted (the rollout is the moment to re-confirm via the UI).
--
-- Idempotent via NOT EXISTS: monitors keyed on (project_id, slug) among live rows,
-- alerts keyed on monitor_id. ids are cuid-shaped (24 chars) to match the schema.

-- 1. Monitor rows (one per project per slug). ---------------------------------
INSERT INTO "latitude"."monitors" (id, organization_id, project_id, slug, name, description, system, created_at, updated_at)
SELECT substr(md5(gen_random_uuid()::text), 1, 24), p.organization_id, p.id,
  'issue-discovered', 'Issue discovered', 'Notifies each time a new issue is detected.', true, now(), now()
FROM "latitude"."projects" p
WHERE NOT EXISTS (
  SELECT 1 FROM "latitude"."monitors" m
  WHERE m.project_id = p.id AND m.slug = 'issue-discovered' AND m.deleted_at IS NULL
);
--> statement-breakpoint
INSERT INTO "latitude"."monitors" (id, organization_id, project_id, slug, name, description, system, created_at, updated_at)
SELECT substr(md5(gen_random_uuid()::text), 1, 24), p.organization_id, p.id,
  'issue-regressed', 'Issue regressed', 'Notifies each time a resolved issue is detected again.', true, now(), now()
FROM "latitude"."projects" p
WHERE NOT EXISTS (
  SELECT 1 FROM "latitude"."monitors" m
  WHERE m.project_id = p.id AND m.slug = 'issue-regressed' AND m.deleted_at IS NULL
);
--> statement-breakpoint
INSERT INTO "latitude"."monitors" (id, organization_id, project_id, slug, name, description, system, created_at, updated_at)
SELECT substr(md5(gen_random_uuid()::text), 1, 24), p.organization_id, p.id,
  'issue-escalating', 'Issue escalating',
  'Notifies when an ongoing issue''s occurrence rate crosses the escalation threshold, and again when it returns to baseline.',
  true, now(), now()
FROM "latitude"."projects" p
WHERE NOT EXISTS (
  SELECT 1 FROM "latitude"."monitors" m
  WHERE m.project_id = p.id AND m.slug = 'issue-escalating' AND m.deleted_at IS NULL
);
--> statement-breakpoint
-- 2. Alert rows (one per system monitor). ------------------------------------
INSERT INTO "latitude"."monitor_alerts" (id, organization_id, monitor_id, kind, source_type, source_id, condition, severity, created_at)
SELECT substr(md5(gen_random_uuid()::text), 1, 24), m.organization_id, m.id,
  'issue.new', 'issue', NULL, NULL, 'medium', now()
FROM "latitude"."monitors" m
WHERE m.slug = 'issue-discovered' AND m.system = true AND NOT EXISTS (
  SELECT 1 FROM "latitude"."monitor_alerts" a WHERE a.monitor_id = m.id
);
--> statement-breakpoint
INSERT INTO "latitude"."monitor_alerts" (id, organization_id, monitor_id, kind, source_type, source_id, condition, severity, created_at)
SELECT substr(md5(gen_random_uuid()::text), 1, 24), m.organization_id, m.id,
  'issue.regressed', 'issue', NULL, NULL, 'high', now()
FROM "latitude"."monitors" m
WHERE m.slug = 'issue-regressed' AND m.system = true AND NOT EXISTS (
  SELECT 1 FROM "latitude"."monitor_alerts" a WHERE a.monitor_id = m.id
);
--> statement-breakpoint
INSERT INTO "latitude"."monitor_alerts" (id, organization_id, monitor_id, kind, source_type, source_id, condition, severity, created_at)
SELECT substr(md5(gen_random_uuid()::text), 1, 24), m.organization_id, m.id,
  'issue.escalating', 'issue', NULL, '{"kind":"issue.escalating","sensitivity":3}'::jsonb, 'high', now()
FROM "latitude"."monitors" m
WHERE m.slug = 'issue-escalating' AND m.system = true AND NOT EXISTS (
  SELECT 1 FROM "latitude"."monitor_alerts" a WHERE a.monitor_id = m.id
);

ALTER TABLE "latitude"."alert_incidents" RENAME TO "incidents";--> statement-breakpoint
ALTER TABLE "latitude"."incidents" RENAME CONSTRAINT "alert_incidents_pkey" TO "incidents_pkey";--> statement-breakpoint
ALTER INDEX "latitude"."alert_incidents_project_started_at_idx" RENAME TO "incidents_project_started_at_idx";--> statement-breakpoint
ALTER INDEX "latitude"."alert_incidents_source_idx" RENAME TO "incidents_source_idx";--> statement-breakpoint
DROP INDEX "latitude"."alert_incidents_open_by_kind_idx";--> statement-breakpoint
DROP INDEX "latitude"."alert_incidents_monitor_alert_idx";--> statement-breakpoint
ALTER TABLE "latitude"."monitors" ADD COLUMN "target_type" varchar(32);--> statement-breakpoint
ALTER TABLE "latitude"."monitors" ADD COLUMN "target_id" varchar(24);--> statement-breakpoint
ALTER TABLE "latitude"."monitors" ADD COLUMN "trigger" varchar(32);--> statement-breakpoint
ALTER TABLE "latitude"."monitors" ADD COLUMN "config" jsonb;--> statement-breakpoint
ALTER TABLE "latitude"."monitors" ADD COLUMN "severity" varchar(16);--> statement-breakpoint
ALTER TABLE "latitude"."signals" ADD COLUMN "muted_at" timestamp with time zone;--> statement-breakpoint
CREATE TEMP TABLE "monitors_consolidation_multi_alert_monitors" AS
SELECT a.monitor_id
FROM "latitude"."monitor_alerts" a
WHERE a.deleted_at IS NULL AND a.kind NOT LIKE 'issue.%'
GROUP BY a.monitor_id
HAVING count(*) > 1;--> statement-breakpoint
DELETE FROM "latitude"."incidents" i
USING "latitude"."monitor_alerts" a, "monitors_consolidation_multi_alert_monitors" m
WHERE i.monitor_alert_id = a.id AND a.monitor_id = m.monitor_id;--> statement-breakpoint
DELETE FROM "latitude"."monitor_alerts" a
USING "monitors_consolidation_multi_alert_monitors" m
WHERE a.monitor_id = m.monitor_id;--> statement-breakpoint
DELETE FROM "latitude"."monitors" m
USING "monitors_consolidation_multi_alert_monitors" multi
WHERE m.id = multi.monitor_id;--> statement-breakpoint
DROP TABLE "monitors_consolidation_multi_alert_monitors";--> statement-breakpoint
WITH fold_alerts AS (
  SELECT DISTINCT ON (a.monitor_id)
    a.id,
    a.monitor_id,
    a.kind,
    a.source_type,
    a.source_id,
    a.condition,
    a.severity,
    a.deleted_at
  FROM "latitude"."monitor_alerts" a
  WHERE a.kind NOT LIKE 'issue.%'
  ORDER BY a.monitor_id, (a.deleted_at IS NULL) DESC, a.created_at DESC, a.id DESC
),
monitor_rules AS (
  SELECT
    m.id,
    CASE
      WHEN a.kind LIKE 'savedSearch.%' OR m.target_saved_search_id IS NOT NULL THEN 'savedSearch'
      WHEN m.target_stream = 'spans' THEN 'tool'
      WHEN m.target_stream = 'sessions' THEN 'session'
      ELSE 'user'
    END AS target_type,
    CASE
      WHEN a.kind LIKE 'savedSearch.%' OR m.target_saved_search_id IS NOT NULL THEN COALESCE(m.target_saved_search_id, a.source_id)
      ELSE NULL
    END AS target_id,
    CASE
      WHEN a.kind LIKE '%.threshold' THEN 'threshold'
      WHEN a.kind LIKE '%.escalating' THEN 'escalating'
      ELSE 'match'
    END AS trigger,
    jsonb_strip_nulls(jsonb_build_object(
      'filterSet',
        CASE
          WHEN a.kind LIKE 'savedSearch.%' OR m.target_saved_search_id IS NOT NULL THEN NULL
          ELSE m.target_filter_set
        END,
      'metric',
        CASE
          WHEN a.kind LIKE '%.match' OR a.kind = 'event.matched' THEN NULL
          ELSE COALESCE(a.condition->'metric', m.metric, '{"kind":"count"}'::jsonb)
        END,
      'condition',
        CASE
          WHEN a.kind LIKE '%.threshold' THEN jsonb_strip_nulls(jsonb_build_object(
            'trigger', 'threshold',
            'metric', COALESCE(a.condition->'metric', m.metric, '{"kind":"count"}'::jsonb),
            'threshold',
              CASE
                WHEN a.condition->'threshold'->>'mode' = 'absolute' AND (a.condition->'threshold') ? 'count'
                  THEN jsonb_build_object('mode', 'absolute', 'value', (a.condition->'threshold'->>'count')::numeric)
                ELSE a.condition->'threshold'
              END,
            'direction', a.condition->'direction'
          ))
          WHEN a.kind LIKE '%.escalating' THEN jsonb_strip_nulls(jsonb_build_object(
            'trigger', 'escalating',
            'metric', COALESCE(a.condition->'metric', m.metric, '{"kind":"count"}'::jsonb),
            'threshold',
              CASE
                WHEN a.condition->'threshold'->>'mode' = 'absolute' AND (a.condition->'threshold') ? 'count'
                  THEN jsonb_build_object('mode', 'absolute', 'value', (a.condition->'threshold'->>'count')::numeric)
                ELSE a.condition->'threshold'
              END,
            'direction', a.condition->'direction',
            'window', a.condition->'window'
          ))
          ELSE NULL
        END
    )) AS config,
    a.severity,
    a.deleted_at
  FROM "latitude"."monitors" m
  JOIN fold_alerts a ON a.monitor_id = m.id
)
UPDATE "latitude"."monitors" m
SET
  target_type = r.target_type,
  target_id = r.target_id,
  trigger = r.trigger,
  config = r.config,
  severity = r.severity,
  deleted_at = COALESCE(m.deleted_at, r.deleted_at)
FROM monitor_rules r
WHERE m.id = r.id;--> statement-breakpoint
WITH live_alerts AS (
  SELECT
    a.id,
    a.monitor_id,
    a.kind,
    a.condition
  FROM "latitude"."monitor_alerts" a
  WHERE a.kind NOT LIKE 'issue.%'
)
UPDATE "latitude"."incidents" i
SET
  source_type = 'monitor',
  source_id = a.monitor_id,
  condition =
    CASE
      WHEN a.kind LIKE '%.threshold' THEN jsonb_strip_nulls(jsonb_build_object(
        'trigger', 'threshold',
        'metric', COALESCE(a.condition->'metric', '{"kind":"count"}'::jsonb),
        'threshold',
          CASE
            WHEN a.condition->'threshold'->>'mode' = 'absolute' AND (a.condition->'threshold') ? 'count'
              THEN jsonb_build_object('mode', 'absolute', 'value', (a.condition->'threshold'->>'count')::numeric)
            ELSE a.condition->'threshold'
          END,
        'direction', a.condition->'direction'
      ))
      WHEN a.kind LIKE '%.escalating' THEN jsonb_strip_nulls(jsonb_build_object(
        'trigger', 'escalating',
        'metric', COALESCE(a.condition->'metric', '{"kind":"count"}'::jsonb),
        'threshold',
          CASE
            WHEN a.condition->'threshold'->>'mode' = 'absolute' AND (a.condition->'threshold') ? 'count'
              THEN jsonb_build_object('mode', 'absolute', 'value', (a.condition->'threshold'->>'count')::numeric)
            ELSE a.condition->'threshold'
          END,
        'direction', a.condition->'direction',
        'window', a.condition->'window'
      ))
      ELSE NULL
    END
FROM live_alerts a
WHERE i.monitor_alert_id = a.id;--> statement-breakpoint
UPDATE "latitude"."incidents"
SET source_type = 'signal', condition = NULL
WHERE source_type = 'issue' AND kind = 'issue.escalating' AND source_id IS NOT NULL;--> statement-breakpoint
DELETE FROM "latitude"."incidents"
WHERE source_id IS NULL
   OR source_type IS NULL
   OR source_type NOT IN ('monitor', 'signal')
   OR kind IN ('issue.new', 'issue.regressed');--> statement-breakpoint
DELETE FROM "latitude"."monitors" WHERE target_type IS NULL;--> statement-breakpoint
ALTER TABLE "latitude"."monitors" ALTER COLUMN "target_type" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."monitors" ALTER COLUMN "trigger" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."monitors" ALTER COLUMN "config" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."monitors" ALTER COLUMN "severity" SET NOT NULL;--> statement-breakpoint
DROP POLICY "monitor_alerts_organization_policy" ON "latitude"."monitor_alerts";--> statement-breakpoint
DROP TABLE "latitude"."monitor_alerts";--> statement-breakpoint
ALTER TABLE "latitude"."monitors" DROP COLUMN "target_stream";--> statement-breakpoint
ALTER TABLE "latitude"."monitors" DROP COLUMN "target_filter_set";--> statement-breakpoint
ALTER TABLE "latitude"."monitors" DROP COLUMN "target_query";--> statement-breakpoint
ALTER TABLE "latitude"."monitors" DROP COLUMN "target_saved_search_id";--> statement-breakpoint
ALTER TABLE "latitude"."monitors" DROP COLUMN "metric";--> statement-breakpoint
ALTER TABLE "latitude"."signals" DROP COLUMN "escalated_at";--> statement-breakpoint
ALTER TABLE "latitude"."signals" DROP COLUMN "resolved_at";--> statement-breakpoint
ALTER TABLE "latitude"."signals" DROP COLUMN "ignored_at";--> statement-breakpoint
ALTER TABLE "latitude"."incidents" DROP COLUMN "kind";--> statement-breakpoint
ALTER TABLE "latitude"."incidents" DROP COLUMN "monitor_alert_id";--> statement-breakpoint
ALTER TABLE "latitude"."incidents" ALTER COLUMN "source_type" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."incidents" ALTER COLUMN "source_id" SET NOT NULL;--> statement-breakpoint
DROP INDEX IF EXISTS "latitude"."signals_project_lifecycle_idx";--> statement-breakpoint
CREATE INDEX "signals_project_lifecycle_idx" ON "latitude"."signals" ("organization_id","project_id","muted_at","created_at");--> statement-breakpoint
WITH duplicate_open_incidents AS (
  SELECT id
  FROM (
    SELECT
      id,
      row_number() OVER (
        PARTITION BY organization_id, source_type, source_id
        ORDER BY started_at DESC, id DESC
      ) AS duplicate_rank
    FROM "latitude"."incidents"
    WHERE ended_at IS NULL
  ) ranked
  WHERE duplicate_rank > 1
)
DELETE FROM "latitude"."incidents" i
USING duplicate_open_incidents d
WHERE i.id = d.id;--> statement-breakpoint
CREATE UNIQUE INDEX "incidents_open_source_idx" ON "latitude"."incidents" ("organization_id","source_type","source_id") WHERE ended_at IS NULL;--> statement-breakpoint
CREATE INDEX "monitors_config_filter_set_idx" ON "latitude"."monitors" USING gin (("config"->'filterSet')) WHERE deleted_at IS NULL;--> statement-breakpoint
ALTER POLICY "alert_incidents_organization_policy" ON "latitude"."incidents" RENAME TO "incidents_organization_policy";

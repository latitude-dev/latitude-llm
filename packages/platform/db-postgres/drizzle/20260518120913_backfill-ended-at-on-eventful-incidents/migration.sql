-- Custom SQL migration file, put your code below! --
-- Backfill `ended_at` for point-in-time alert incident kinds. Eventful incidents
-- (`issue.new`, `issue.regressed`) are now created with `ended_at = started_at`
-- so that the rendering layer can decide point-vs-range purely from timestamps
-- (`ended_at IS NULL` becomes a clean signal for "open lifecycle incident", which
-- only applies to `issue.escalating`).
UPDATE "latitude"."alert_incidents"
SET "ended_at" = "started_at"
WHERE "kind" IN ('issue.new', 'issue.regressed')
  AND "ended_at" IS NULL;

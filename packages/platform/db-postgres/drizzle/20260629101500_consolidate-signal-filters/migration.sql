-- Consolidate evaluation scope filters onto signals.filters (single source of truth).

UPDATE "latitude"."signals" s
SET "filters" = e."trigger"->'filter'
FROM "latitude"."evaluations" e
WHERE e."signal_id" = s."id"
  AND e."deleted_at" IS NULL
  AND e."archived_at" IS NULL
  AND s."filters" IS NULL
  AND e."trigger" ? 'filter'
  AND e."trigger"->'filter' != '{}'::jsonb;--> statement-breakpoint

UPDATE "latitude"."evaluations"
SET "trigger" = "trigger" - 'filter'
WHERE "trigger" ? 'filter';

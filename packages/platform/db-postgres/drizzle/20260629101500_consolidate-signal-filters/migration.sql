-- Consolidate evaluation scope filters onto signals.filters (single source of truth).

UPDATE "latitude"."signals" s
SET "filters" = ranked."filter"
FROM (
  SELECT DISTINCT ON (e."signal_id")
    e."signal_id",
    e."trigger"->'filter' AS "filter"
  FROM "latitude"."evaluations" e
  WHERE e."deleted_at" IS NULL
    AND e."archived_at" IS NULL
    AND e."trigger" ? 'filter'
    AND e."trigger"->'filter' != '{}'::jsonb
  ORDER BY e."signal_id", e."updated_at" DESC, e."created_at" DESC
) ranked
WHERE ranked."signal_id" = s."id"
  AND s."filters" IS NULL;--> statement-breakpoint

UPDATE "latitude"."evaluations"
SET "trigger" = "trigger" - 'filter'
WHERE "trigger" ? 'filter';

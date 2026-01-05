-- Custom SQL migration file, put your code below! --

-- Backfill evaluationType and evaluationMetric for existing evaluation results
-- This migration is idempotent - it only updates rows where evaluation_type IS NULL
UPDATE "latitude"."evaluation_results_v2" r
SET evaluation_type = v.type, evaluation_metric = v.metric
FROM (
  SELECT DISTINCT ON (evaluation_uuid) evaluation_uuid, type, metric
  FROM "latitude"."evaluation_versions"
  ORDER BY evaluation_uuid, id DESC
) v
WHERE r.evaluation_uuid = v.evaluation_uuid
AND r.evaluation_type IS NULL;

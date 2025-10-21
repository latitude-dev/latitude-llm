-- Custom SQL migration file, put you code below! --

WITH latest_provider_logs AS (
  SELECT 
    pl.id as provider_log_id,
    pl.document_log_uuid,
    ROW_NUMBER() OVER (PARTITION BY pl.document_log_uuid ORDER BY pl.generated_at DESC) as rn
  FROM "latitude"."provider_logs" pl
  WHERE pl.document_log_uuid IS NOT NULL
)
UPDATE "latitude"."evaluation_results" er
SET evaluated_provider_log_id = lpl.provider_log_id
FROM "latitude"."document_logs" dl
JOIN latest_provider_logs lpl ON dl.uuid = lpl.document_log_uuid
WHERE er.document_log_id = dl.id
AND lpl.rn = 1
AND er.evaluated_provider_log_id IS NULL;
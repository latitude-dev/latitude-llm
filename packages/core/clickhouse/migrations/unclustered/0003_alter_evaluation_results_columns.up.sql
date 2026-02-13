ALTER TABLE evaluation_results
  DROP COLUMN IF EXISTS commit_id,
  DROP COLUMN IF EXISTS evaluation_name,
  DROP COLUMN IF EXISTS evaluated_log_id,
  ADD COLUMN IF NOT EXISTS evaluated_log_uuid Nullable(String) AFTER evaluated_row_id;

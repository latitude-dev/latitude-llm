ALTER TABLE evaluation_results ON CLUSTER default
  DROP COLUMN IF EXISTS evaluated_log_uuid,
  ADD COLUMN IF NOT EXISTS commit_id UInt64 AFTER project_id,
  ADD COLUMN IF NOT EXISTS evaluation_name String AFTER evaluation_uuid,
  ADD COLUMN IF NOT EXISTS evaluated_log_id Nullable(UInt64) AFTER evaluated_row_id;

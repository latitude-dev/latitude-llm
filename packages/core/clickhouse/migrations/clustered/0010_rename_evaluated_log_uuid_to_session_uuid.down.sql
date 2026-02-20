ALTER TABLE evaluation_results ON CLUSTER default DROP INDEX IF EXISTS idx_session_id;
ALTER TABLE evaluation_results ON CLUSTER default RENAME COLUMN IF EXISTS session_id TO evaluated_log_uuid;

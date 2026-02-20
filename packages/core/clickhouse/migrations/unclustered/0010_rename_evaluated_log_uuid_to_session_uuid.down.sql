ALTER TABLE evaluation_results DROP INDEX IF EXISTS idx_session_id;
ALTER TABLE evaluation_results RENAME COLUMN IF EXISTS session_id TO evaluated_log_uuid;

ALTER TABLE evaluation_results RENAME COLUMN IF EXISTS evaluated_log_uuid TO session_id;
ALTER TABLE evaluation_results ADD INDEX IF NOT EXISTS idx_session_id session_id TYPE bloom_filter(0.01) GRANULARITY 1;

ALTER TABLE evaluation_results ADD COLUMN IF NOT EXISTS issue_ids Array(UInt64) DEFAULT [];
ALTER TABLE evaluation_results ADD INDEX IF NOT EXISTS idx_issue_ids issue_ids TYPE bloom_filter(0.01) GRANULARITY 1;

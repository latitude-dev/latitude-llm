ALTER TABLE evaluation_results ON CLUSTER default DROP INDEX IF EXISTS idx_issue_ids;
ALTER TABLE evaluation_results ON CLUSTER default DROP COLUMN IF EXISTS issue_ids;

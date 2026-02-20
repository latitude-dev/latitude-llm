ALTER TABLE evaluation_results DROP INDEX IF EXISTS idx_issue_ids;
ALTER TABLE evaluation_results DROP COLUMN IF EXISTS issue_ids;

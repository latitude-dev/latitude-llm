ALTER TABLE evaluation_results ON CLUSTER default DROP INDEX IF EXISTS idx_evaluated_span_id;
ALTER TABLE evaluation_results ON CLUSTER default DROP INDEX IF EXISTS idx_evaluated_trace_id;
ALTER TABLE evaluation_results ON CLUSTER default DROP INDEX IF EXISTS idx_experiment_id;
ALTER TABLE evaluation_results ON CLUSTER default DROP INDEX IF EXISTS idx_document_uuid;
ALTER TABLE evaluation_results ON CLUSTER default DROP INDEX IF EXISTS idx_commit_uuid;
ALTER TABLE evaluation_results ON CLUSTER default DROP INDEX IF EXISTS idx_uuid;

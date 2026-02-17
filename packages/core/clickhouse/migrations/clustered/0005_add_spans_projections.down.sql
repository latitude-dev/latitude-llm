ALTER TABLE spans ON CLUSTER default DROP PROJECTION IF EXISTS proj_spans_document_log_started_at;
ALTER TABLE spans ON CLUSTER default DROP PROJECTION IF EXISTS proj_spans_project_started_at;
ALTER TABLE spans ON CLUSTER default DROP PROJECTION IF EXISTS proj_spans_document_commit_started_at;

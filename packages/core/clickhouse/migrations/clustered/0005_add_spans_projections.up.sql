ALTER TABLE spans ON CLUSTER default
  ADD PROJECTION IF NOT EXISTS proj_spans_document_commit_started_at
  (
    SELECT *
    ORDER BY
      workspace_id,
      document_uuid,
      coalesce(commit_uuid, toUUID('00000000-0000-0000-0000-000000000000')),
      started_at,
      span_id
  ),
  ADD PROJECTION IF NOT EXISTS proj_spans_project_started_at
  (
    SELECT *
    ORDER BY
      workspace_id,
      coalesce(project_id, toUInt64(0)),
      started_at,
      span_id
  ),
  ADD PROJECTION IF NOT EXISTS proj_spans_document_log_started_at
  (
    SELECT *
    ORDER BY
      workspace_id,
      coalesce(
        document_log_uuid,
        toUUID('00000000-0000-0000-0000-000000000000')
      ),
      started_at,
      span_id
  );

ALTER TABLE spans ON CLUSTER default MATERIALIZE PROJECTION proj_spans_document_commit_started_at;
ALTER TABLE spans ON CLUSTER default MATERIALIZE PROJECTION proj_spans_project_started_at;
ALTER TABLE spans ON CLUSTER default MATERIALIZE PROJECTION proj_spans_document_log_started_at;

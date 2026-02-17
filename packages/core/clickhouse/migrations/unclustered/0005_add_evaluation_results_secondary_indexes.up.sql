ALTER TABLE evaluation_results
  ADD INDEX IF NOT EXISTS idx_uuid uuid TYPE bloom_filter(0.01) GRANULARITY 1,
  ADD INDEX IF NOT EXISTS idx_commit_uuid commit_uuid TYPE bloom_filter(0.01) GRANULARITY 1,
  ADD INDEX IF NOT EXISTS idx_document_uuid document_uuid TYPE bloom_filter(0.01) GRANULARITY 1,
  ADD INDEX IF NOT EXISTS idx_experiment_id experiment_id TYPE bloom_filter(0.01) GRANULARITY 1,
  ADD INDEX IF NOT EXISTS idx_evaluated_trace_id evaluated_trace_id TYPE bloom_filter(0.01) GRANULARITY 1,
  ADD INDEX IF NOT EXISTS idx_evaluated_span_id evaluated_span_id TYPE bloom_filter(0.01) GRANULARITY 1;

ALTER TABLE evaluation_results MATERIALIZE INDEX idx_uuid;
ALTER TABLE evaluation_results MATERIALIZE INDEX idx_commit_uuid;
ALTER TABLE evaluation_results MATERIALIZE INDEX idx_document_uuid;
ALTER TABLE evaluation_results MATERIALIZE INDEX idx_experiment_id;
ALTER TABLE evaluation_results MATERIALIZE INDEX idx_evaluated_trace_id;
ALTER TABLE evaluation_results MATERIALIZE INDEX idx_evaluated_span_id;

ALTER TABLE evaluation_results ON CLUSTER default
  ADD INDEX IF NOT EXISTS idx_evaluated_span_trace (evaluated_span_id, evaluated_trace_id)
  TYPE bloom_filter(0.001)
  GRANULARITY 1;

ALTER TABLE evaluation_results ON CLUSTER default MATERIALIZE INDEX idx_evaluated_span_trace;

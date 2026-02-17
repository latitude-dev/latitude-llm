ALTER TABLE evaluation_results
  ADD INDEX IF NOT EXISTS idx_evaluated_span_trace (evaluated_span_id, evaluated_trace_id)
  TYPE bloom_filter(0.001)
  GRANULARITY 1;

ALTER TABLE evaluation_results MATERIALIZE INDEX idx_evaluated_span_trace;

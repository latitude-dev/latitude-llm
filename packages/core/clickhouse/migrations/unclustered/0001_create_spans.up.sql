CREATE TABLE IF NOT EXISTS spans (
  workspace_id UInt64,
  trace_id FixedString(32),
  span_id FixedString(16),
  parent_id Nullable(FixedString(16)),
  previous_trace_id Nullable(FixedString(32)),

  api_key_id UInt64,
  document_log_uuid Nullable(UUID),
  document_uuid Nullable(UUID),
  commit_uuid Nullable(UUID),
  experiment_uuid Nullable(UUID),
  project_id Nullable(UInt64),
  test_deployment_id Nullable(UInt64),

  name String,
  kind LowCardinality(String),
  type LowCardinality(String),
  status LowCardinality(String),
  message Nullable(String),
  duration_ms UInt64,
  started_at DateTime64(6, 'UTC'),
  ended_at DateTime64(6, 'UTC'),
  source Nullable(String),

  provider LowCardinality(String) DEFAULT '',
  model Nullable(String),
  cost Nullable(Int64) DEFAULT NULL,
  tokens_prompt Nullable(UInt32),
  tokens_cached Nullable(UInt32),
  tokens_reasoning Nullable(UInt32),
  tokens_completion Nullable(UInt32),

  ingested_at DateTime64(6, 'UTC') DEFAULT now64(6),
  retention_expires_at DateTime64(6, 'UTC') DEFAULT toDateTime64('2100-01-01 00:00:00', 6, 'UTC'),

  INDEX idx_trace_id trace_id TYPE bloom_filter(0.001) GRANULARITY 1,
  INDEX idx_document_uuid document_uuid TYPE bloom_filter(0.01) GRANULARITY 1,
  INDEX idx_commit_uuid commit_uuid TYPE bloom_filter(0.01) GRANULARITY 1,
  INDEX idx_document_log_uuid document_log_uuid TYPE bloom_filter(0.01) GRANULARITY 1,
  INDEX idx_project_id project_id TYPE bloom_filter(0.01) GRANULARITY 1
)
ENGINE = ReplacingMergeTree(ingested_at)
PARTITION BY toYYYYMM(started_at)
PRIMARY KEY (workspace_id, started_at)
ORDER BY (workspace_id, started_at, trace_id, span_id);

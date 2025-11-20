CREATE TABLE IF NOT EXISTS latitude.spans (
  workspace_id UInt64,
  trace_id FixedString(32),
  span_id FixedString(16),
  parent_id Nullable(FixedString(16)),
  api_key_id UInt64,
  name String,
  kind LowCardinality(String),
  type LowCardinality(String),
  status LowCardinality(String),
  message String,
  duration_ms UInt32,
  started_at DateTime64(6, 'UTC'),
  ended_at DateTime64(6, 'UTC'),
  document_log_uuid Nullable(UUID),
  document_uuid Nullable(UUID),
  commit_uuid Nullable(UUID),
  experiment_uuid Nullable(UUID),
  project_id Nullable(UInt64),
  
  -- Denormalized analytics
  provider LowCardinality(String),
  model LowCardinality(String),
  cost Float64,
  tokens_prompt UInt32,
  tokens_cached UInt32,
  tokens_reasoning UInt32,
  tokens_completion UInt32,
  
  ingested_at DateTime64(6, 'UTC') DEFAULT now()
)
ENGINE = ReplacingMergeTree(ingested_at)
PARTITION BY toYYYYMM(started_at)
ORDER BY (workspace_id, trace_id, started_at, span_id)
TTL started_at + INTERVAL 12 MONTH;

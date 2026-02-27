CREATE TABLE IF NOT EXISTS spans ON CLUSTER default (
  workspace_id UInt64,
  trace_id FixedString(32),
  span_id FixedString(16),
  parent_id Nullable(FixedString(16)),

  api_key_id UInt64,

  name String,
  kind LowCardinality(String),
  status LowCardinality(String),
  message Nullable(String),
  duration_ms UInt64,
  started_at DateTime64(6, 'UTC'),
  ended_at DateTime64(6, 'UTC'),
  source Nullable(String),

  model Nullable(String),
  cost Nullable(Int64) DEFAULT NULL,
  tokens_prompt Nullable(UInt32),
  tokens_cached Nullable(UInt32),
  tokens_reasoning Nullable(UInt32),
  tokens_completion Nullable(UInt32),
  input Nullable(String) CODEC(ZSTD(3)),
  output Nullable(String) CODEC(ZSTD(3)),
  attributes String,

  ingested_at DateTime64(6, 'UTC') DEFAULT now64(6),
  retention_expires_at DateTime64(6, 'UTC') DEFAULT toDateTime64('2100-01-01 00:00:00', 6, 'UTC'),

  INDEX idx_trace_id trace_id TYPE bloom_filter(0.001) GRANULARITY 1,
  INDEX idx_api_key_id api_key_id TYPE bloom_filter(0.01) GRANULARITY 1
)
ENGINE = ReplicatedReplacingMergeTree(ingested_at)
PARTITION BY toYYYYMM(started_at)
PRIMARY KEY (workspace_id, started_at)
ORDER BY (workspace_id, started_at, trace_id, span_id);

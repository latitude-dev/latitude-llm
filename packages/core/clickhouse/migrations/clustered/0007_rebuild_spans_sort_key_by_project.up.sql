CREATE TABLE IF NOT EXISTS spans_rebuild_0006 ON CLUSTER default (
  workspace_id UInt64,
  trace_id FixedString(32),
  span_id FixedString(16),
  parent_id Nullable(FixedString(16)),
  previous_trace_id Nullable(FixedString(32)),

  api_key_id UInt64,
  document_log_uuid Nullable(UUID),
  document_uuid Nullable(UUID),
  document_uuid_key UUID MATERIALIZED ifNull(document_uuid, toUUID('00000000-0000-0000-0000-000000000000')),
  commit_uuid Nullable(UUID),
  commit_uuid_key UUID MATERIALIZED ifNull(commit_uuid, toUUID('00000000-0000-0000-0000-000000000000')),
  experiment_uuid Nullable(UUID),
  project_id Nullable(UInt64),
  project_id_key UInt64 MATERIALIZED ifNull(project_id, 0),
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
  INDEX idx_span_trace_ids (span_id, trace_id) TYPE bloom_filter(0.001) GRANULARITY 1,
  INDEX idx_document_log_uuid document_log_uuid TYPE bloom_filter(0.01) GRANULARITY 1,
  INDEX idx_experiment_uuid experiment_uuid TYPE bloom_filter(0.01) GRANULARITY 1,
  INDEX idx_parent_id parent_id TYPE bloom_filter(0.01) GRANULARITY 1,
  INDEX idx_test_deployment_id test_deployment_id TYPE bloom_filter(0.01) GRANULARITY 1
)
ENGINE = ReplicatedReplacingMergeTree(ingested_at)
PARTITION BY toYYYYMM(started_at)
PRIMARY KEY (
  workspace_id,
  project_id_key,
  commit_uuid_key,
  document_uuid_key,
  started_at
)
ORDER BY (
  workspace_id,
  project_id_key,
  commit_uuid_key,
  document_uuid_key,
  started_at,
  trace_id,
  span_id
);

INSERT INTO spans_rebuild_0006 (
  workspace_id,
  trace_id,
  span_id,
  parent_id,
  previous_trace_id,
  api_key_id,
  document_log_uuid,
  document_uuid,
  commit_uuid,
  experiment_uuid,
  project_id,
  test_deployment_id,
  name,
  kind,
  type,
  status,
  message,
  duration_ms,
  started_at,
  ended_at,
  source,
  provider,
  model,
  cost,
  tokens_prompt,
  tokens_cached,
  tokens_reasoning,
  tokens_completion,
  ingested_at,
  retention_expires_at
)
SELECT
  workspace_id,
  trace_id,
  span_id,
  parent_id,
  previous_trace_id,
  api_key_id,
  document_log_uuid,
  document_uuid,
  commit_uuid,
  experiment_uuid,
  project_id,
  test_deployment_id,
  name,
  kind,
  type,
  status,
  message,
  duration_ms,
  started_at,
  ended_at,
  source,
  provider,
  model,
  cost,
  tokens_prompt,
  tokens_cached,
  tokens_reasoning,
  tokens_completion,
  ingested_at,
  retention_expires_at
FROM spans;

RENAME TABLE spans TO spans_backup_0006 ON CLUSTER default;
RENAME TABLE spans_rebuild_0006 TO spans ON CLUSTER default;

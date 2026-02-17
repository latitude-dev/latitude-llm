CREATE TABLE IF NOT EXISTS evaluation_results_rebuild_0005 ON CLUSTER default (
  id UInt64,
  uuid UUID,
  workspace_id UInt64,

  project_id UInt64,
  commit_uuid UUID,
  document_uuid UUID,

  evaluation_uuid UUID,
  type LowCardinality(Nullable(String)),
  metric LowCardinality(Nullable(String)),

  model LowCardinality(Nullable(String)),
  provider LowCardinality(Nullable(String)),

  experiment_id Nullable(UInt64),
  dataset_id Nullable(UInt64),
  evaluated_row_id Nullable(UInt64),
  evaluated_log_uuid Nullable(String),

  evaluated_span_id Nullable(String),
  evaluated_trace_id Nullable(String),

  score Nullable(Int64),
  normalized_score Nullable(Int64),
  has_passed Nullable(UInt8),

  tokens Nullable(Int64),
  cost Nullable(Int64),

  metadata Nullable(String) CODEC(ZSTD(3)),
  error Nullable(String) CODEC(ZSTD(3)),

  created_at DateTime64(3, 'UTC'),
  updated_at DateTime64(3, 'UTC'),
  created_date Date MATERIALIZED toDate(created_at),
  has_error UInt8 MATERIALIZED if(isNull(error), 0, 1),

  INDEX idx_evaluated_span_trace (evaluated_span_id, evaluated_trace_id)
    TYPE bloom_filter(0.001)
    GRANULARITY 1
)
ENGINE = ReplicatedReplacingMergeTree(updated_at)
PARTITION BY toYYYYMM(created_at)
PRIMARY KEY (workspace_id, project_id, evaluation_uuid, created_at)
ORDER BY (workspace_id, project_id, evaluation_uuid, created_at, id)
SETTINGS index_granularity = 8192;

INSERT INTO evaluation_results_rebuild_0005 (
  id,
  uuid,
  workspace_id,
  project_id,
  commit_uuid,
  document_uuid,
  evaluation_uuid,
  type,
  metric,
  model,
  provider,
  experiment_id,
  dataset_id,
  evaluated_row_id,
  evaluated_log_uuid,
  evaluated_span_id,
  evaluated_trace_id,
  score,
  normalized_score,
  has_passed,
  tokens,
  cost,
  metadata,
  error,
  created_at,
  updated_at
)
SELECT
  id,
  uuid,
  workspace_id,
  project_id,
  commit_uuid,
  document_uuid,
  evaluation_uuid,
  type,
  metric,
  model,
  provider,
  experiment_id,
  dataset_id,
  evaluated_row_id,
  evaluated_log_uuid,
  evaluated_span_id,
  evaluated_trace_id,
  score,
  normalized_score,
  has_passed,
  tokens,
  cost,
  metadata,
  error,
  created_at,
  updated_at
FROM evaluation_results;

RENAME TABLE
  evaluation_results TO evaluation_results_backup_0005,
  evaluation_results_rebuild_0005 TO evaluation_results
ON CLUSTER default;

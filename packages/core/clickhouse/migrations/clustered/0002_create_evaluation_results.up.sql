CREATE TABLE IF NOT EXISTS evaluation_results ON CLUSTER default (
  id UInt64,
  uuid UUID,
  workspace_id UInt64,

  project_id UInt64,
  commit_id UInt64,
  commit_uuid UUID,
  document_uuid UUID,

  evaluation_uuid UUID,
  evaluation_name String,
  type LowCardinality(Nullable(String)),
  metric LowCardinality(Nullable(String)),

  model LowCardinality(Nullable(String)),
  provider LowCardinality(Nullable(String)),

  experiment_id Nullable(UInt64),
  dataset_id Nullable(UInt64),
  evaluated_row_id Nullable(UInt64),

  evaluated_log_id Nullable(UInt64),
  evaluated_span_id Nullable(String),
  evaluated_trace_id Nullable(String),

  score Nullable(Int64),
  normalized_score Nullable(Int64),
  has_passed Nullable(UInt8),

  tokens Nullable(Int64),
  cost Nullable(Int64),

  metadata Nullable(String),
  error Nullable(String),

  created_at DateTime64(3, 'UTC'),
  updated_at DateTime64(3, 'UTC'),
  created_date Date MATERIALIZED toDate(created_at),
  has_error UInt8 MATERIALIZED if(isNull(error), 0, 1)
)
ENGINE = ReplicatedReplacingMergeTree(updated_at)
PARTITION BY toYYYYMM(created_at)
ORDER BY (workspace_id, created_at, evaluation_uuid, id)
SETTINGS index_granularity = 8192;

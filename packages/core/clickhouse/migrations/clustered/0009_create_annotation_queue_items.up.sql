CREATE TABLE IF NOT EXISTS annotation_queue_items ON CLUSTER default (
  workspace_id UInt64,
  annotation_queue_id UInt64,
  trace_id FixedString(32),
  status LowCardinality(String) DEFAULT 'pending',
  assigned_user_id String DEFAULT '',
  completed_at Nullable(DateTime64(3, 'UTC')),
  completed_by_user_id String DEFAULT '',
  created_at DateTime64(3, 'UTC') DEFAULT now64(3),
  updated_at DateTime64(3, 'UTC') DEFAULT now64(3),

  INDEX idx_trace_id trace_id TYPE bloom_filter(0.001) GRANULARITY 1,
  INDEX idx_status status TYPE set(0) GRANULARITY 1
)
ENGINE = ReplicatedReplacingMergeTree(updated_at)
PARTITION BY toYYYYMM(created_at)
ORDER BY (workspace_id, annotation_queue_id, trace_id);

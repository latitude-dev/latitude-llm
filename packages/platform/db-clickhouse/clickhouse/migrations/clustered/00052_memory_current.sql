-- +goose NO TRANSACTION
-- +goose Up

-- Hot current-state projection: the latest mutating version of each record.
-- No PARTITION BY: partitioning by end_time would scatter a record's versions
-- across monthly partitions, and ReplacingMergeTree only merges within a
-- partition, so "current" would keep one stale row per partition. The table is
-- bounded by the live record count, so a single partition is fine.
CREATE TABLE IF NOT EXISTS memory_current ON CLUSTER default
(
    organization_id LowCardinality(String) CODEC(ZSTD(1)),
    project_id      LowCardinality(String) CODEC(ZSTD(1)),
    scope           String                 CODEC(ZSTD(1)),
    store_id        String                 DEFAULT '' CODEC(ZSTD(1)),
    record_id       String                 DEFAULT '' CODEC(ZSTD(1)),
    content_hash    String                 DEFAULT '' CODEC(ZSTD(1)),
    change_kind     LowCardinality(String) CODEC(ZSTD(1)),
    token_count     UInt32                 DEFAULT 0  CODEC(T64, ZSTD(1)),
    span_id         FixedString(16)        DEFAULT '' CODEC(ZSTD(1)),
    trace_id        FixedString(32)        DEFAULT '' CODEC(ZSTD(1)),
    session_id      String                 DEFAULT '' CODEC(ZSTD(1)),
    end_time        DateTime64(6, 'UTC')   CODEC(Delta(8), ZSTD(1))
)
ENGINE = ReplicatedReplacingMergeTree(end_time)
PRIMARY KEY (organization_id, project_id, scope, store_id, record_id)
ORDER BY (organization_id, project_id, scope, store_id, record_id);

-- +goose Down

DROP TABLE IF EXISTS memory_current ON CLUSTER default;

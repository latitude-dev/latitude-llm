-- +goose NO TRANSACTION
-- +goose Up

-- Append-only memory ledger: one row per memory-operation span's effect on a
-- single record, plus read (search) and store-lifecycle events. Reconstruction
-- reads add/update/remove rows via argMax by end_time; store_delete rows drive
-- the whole-store wipe post-filter. Materialized at the trace-end boundary.
CREATE TABLE IF NOT EXISTS memory_events
(
    organization_id LowCardinality(String) CODEC(ZSTD(1)),
    project_id      LowCardinality(String) CODEC(ZSTD(1)),
    scope           String                 CODEC(ZSTD(1)),
    store_id        String                 DEFAULT '' CODEC(ZSTD(1)),
    record_id       String                 DEFAULT '' CODEC(ZSTD(1)),
    operation       LowCardinality(String) CODEC(ZSTD(1)),
    change_kind     LowCardinality(String) CODEC(ZSTD(1)),
    content_hash    String                 DEFAULT '' CODEC(ZSTD(1)),
    token_count     UInt32                 DEFAULT 0  CODEC(T64, ZSTD(1)),
    record_count    UInt32                 DEFAULT 0  CODEC(T64, ZSTD(1)),
    query_text      String                 DEFAULT '' CODEC(ZSTD(3)),
    span_id         FixedString(16)        DEFAULT '' CODEC(ZSTD(1)),
    trace_id        FixedString(32)        DEFAULT '' CODEC(ZSTD(1)),
    session_id      String                 DEFAULT '' CODEC(ZSTD(1)),
    user_id         String                 DEFAULT '' CODEC(ZSTD(1)),
    start_time      DateTime64(6, 'UTC')   CODEC(Delta(8), ZSTD(1)),
    end_time        DateTime64(6, 'UTC')   CODEC(Delta(8), ZSTD(1)),
    source          LowCardinality(String) DEFAULT 'otlp' CODEC(ZSTD(1)),
    retention_days  UInt16                 DEFAULT 90 CODEC(T64, ZSTD(1)),
    ingested_at     DateTime64(3, 'UTC')   DEFAULT now64(3) CODEC(Delta(8), LZ4),
    INDEX idx_memory_events_session_id session_id TYPE bloom_filter(0.01) GRANULARITY 4
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(end_time)
PRIMARY KEY (organization_id, project_id, scope, store_id, record_id, end_time)
ORDER BY (organization_id, project_id, scope, store_id, record_id, end_time, span_id)
TTL toDateTime(end_time) + toIntervalDay(retention_days + 30) DELETE;

-- +goose Down

DROP TABLE IF EXISTS memory_events;

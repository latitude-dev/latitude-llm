-- +goose NO TRANSACTION
-- +goose Up

CREATE TABLE IF NOT EXISTS trace_message_occurrences ON CLUSTER default
(
    organization_id    LowCardinality(String)                CODEC(ZSTD(1)),
    project_id         LowCardinality(String)                CODEC(ZSTD(1)),
    trace_id           FixedString(32)                       CODEC(ZSTD(1)),
    message_index      UInt16                                CODEC(T64, ZSTD(1)),
    content_hash       String                                CODEC(ZSTD(1)),
    session_id         String                                CODEC(ZSTD(1)),
    start_time         DateTime64(9, 'UTC')                  CODEC(Delta(8), ZSTD(1)),
    role               LowCardinality(String)                CODEC(ZSTD(1)),
    is_output          UInt8                                 CODEC(T64, ZSTD(1)),
    retention_days     UInt16                   DEFAULT 30   CODEC(T64, ZSTD(1)),
    indexed_at         DateTime64(3, 'UTC')     DEFAULT now64(3) CODEC(Delta(8), LZ4),
    PROJECTION trace_message_occurrences_by_trace
    (
        SELECT
            organization_id,
            project_id,
            trace_id,
            message_index,
            content_hash,
            session_id,
            start_time,
            role,
            is_output,
            retention_days,
            indexed_at
        ORDER BY (organization_id, project_id, trace_id, message_index)
    )
)
ENGINE = ReplicatedReplacingMergeTree(indexed_at)
PARTITION BY toYYYYMM(start_time)
PRIMARY KEY (organization_id, project_id, content_hash, trace_id, message_index)
ORDER BY (organization_id, project_id, content_hash, trace_id, message_index)
TTL toDateTime(start_time) + toIntervalDay(retention_days + 30) DELETE
SETTINGS deduplicate_merge_projection_mode = 'rebuild';

-- +goose Down

DROP TABLE IF EXISTS trace_message_occurrences ON CLUSTER default;

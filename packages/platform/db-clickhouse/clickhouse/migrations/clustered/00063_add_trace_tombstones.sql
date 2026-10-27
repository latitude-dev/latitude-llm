-- +goose NO TRANSACTION
-- +goose Up

CREATE TABLE IF NOT EXISTS trace_tombstones ON CLUSTER default
(
    organization_id LowCardinality(FixedString(24)) CODEC(ZSTD(1)),
    project_id      LowCardinality(FixedString(24)) CODEC(ZSTD(1)),
    trace_id        FixedString(32)                 CODEC(ZSTD(1)),
    deleted_at      DateTime64(3, 'UTC')            CODEC(Delta(8), ZSTD(1))
)
ENGINE = ReplicatedReplacingMergeTree(deleted_at)
PARTITION BY toYYYYMM(deleted_at)
ORDER BY (organization_id, project_id, trace_id)
TTL toDateTime(deleted_at) + toIntervalDay(30) DELETE;

-- +goose Down

DROP TABLE IF EXISTS trace_tombstones ON CLUSTER default;

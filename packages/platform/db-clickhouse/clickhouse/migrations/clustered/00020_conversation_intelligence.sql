-- +goose NO TRANSACTION
-- +goose Up

CREATE TABLE IF NOT EXISTS conversation_session_analyses ON CLUSTER default
(
    organization_id       LowCardinality(String) CODEC(ZSTD(1)),
    project_id            LowCardinality(String) CODEC(ZSTD(1)),
    session_id            String                 CODEC(ZSTD(1)),
    start_time            DateTime64(9, 'UTC')   CODEC(Delta(8), ZSTD(1)),
    end_time              DateTime64(9, 'UTC')   CODEC(Delta(8), ZSTD(1)),
    trace_ids             Array(FixedString(32)) CODEC(ZSTD(1)),
    analysis_hash         FixedString(64)        CODEC(ZSTD(1)),
    interaction_kind      LowCardinality(String) CODEC(ZSTD(1)),
    analysis_lens         LowCardinality(String) CODEC(ZSTD(1)),
    analysis_status       LowCardinality(String) CODEC(ZSTD(1)),
    status_reason         String                 DEFAULT '' CODEC(ZSTD(3)),
    detector_version      LowCardinality(String) CODEC(ZSTD(1)),
    retention_days        UInt16                 DEFAULT 90 CODEC(T64, ZSTD(1)),
    indexed_at            DateTime64(3, 'UTC')   DEFAULT now64(3) CODEC(Delta(8), LZ4)
)
ENGINE = ReplicatedReplacingMergeTree(indexed_at)
PARTITION BY toYYYYMM(start_time)
PRIMARY KEY (organization_id, project_id, session_id)
ORDER BY (organization_id, project_id, session_id)
TTL toDateTime(start_time) + toIntervalDay(retention_days + 30) DELETE;

-- +goose Down

DROP TABLE IF EXISTS conversation_session_analyses ON CLUSTER default;

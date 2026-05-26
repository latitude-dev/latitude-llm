-- +goose NO TRANSACTION
-- +goose Up

-- See clustered/00017 for the rationale.

CREATE TABLE IF NOT EXISTS behavior_observations
(
    organization_id           LowCardinality(String) CODEC(ZSTD(1)),
    project_id                LowCardinality(String) CODEC(ZSTD(1)),
    session_id                String                 CODEC(ZSTD(1)),
    start_time                DateTime64(9, 'UTC')   CODEC(Delta(8), ZSTD(1)),
    end_time                  DateTime64(9, 'UTC')   CODEC(Delta(8), ZSTD(1)),
    trace_ids                 Array(FixedString(32)) CODEC(ZSTD(1)),
    summary                   String                 CODEC(ZSTD(3)),
    summary_hash              FixedString(64)        CODEC(ZSTD(1)),
    embedding                 Array(Float32)         CODEC(ZSTD(1)),
    embedding_model           LowCardinality(String) CODEC(ZSTD(1)),
    assigned_cluster_id       String                 DEFAULT '' CODEC(ZSTD(1)),
    assignment_confidence     Float32                DEFAULT 0.0 CODEC(ZSTD(1)),
    assignment_method         LowCardinality(String) DEFAULT '' CODEC(ZSTD(1)),
    reassignment_run_id       String                 DEFAULT '' CODEC(ZSTD(1)),
    retention_days            UInt16                 DEFAULT 90 CODEC(T64, ZSTD(1)),
    indexed_at                DateTime64(3, 'UTC')   DEFAULT now64(3) CODEC(Delta(8), LZ4)
)
ENGINE = ReplacingMergeTree(indexed_at)
PARTITION BY toYYYYMM(start_time)
PRIMARY KEY (organization_id, project_id, session_id)
ORDER BY (organization_id, project_id, session_id)
TTL toDateTime(start_time) + toIntervalDay(retention_days + 30) DELETE;

-- +goose Down

DROP TABLE IF EXISTS behavior_observations;

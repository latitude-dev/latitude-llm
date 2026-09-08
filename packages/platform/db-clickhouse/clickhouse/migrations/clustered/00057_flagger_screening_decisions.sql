-- +goose NO TRANSACTION
-- +goose Up

CREATE TABLE IF NOT EXISTS flagger_screening_decisions ON CLUSTER default
(
    decision_id              FixedString(64)                 CODEC(ZSTD(1)),
    organization_id          LowCardinality(FixedString(24)) CODEC(ZSTD(1)),
    project_id               LowCardinality(FixedString(24)) CODEC(ZSTD(1)),
    session_id               String                          CODEC(ZSTD(1)),
    flagger_slug             LowCardinality(String)          CODEC(ZSTD(1)),
    analysis_hash            FixedString(64)                 CODEC(ZSTD(1)),
    scoring_artifact_version LowCardinality(String)          CODEC(ZSTD(1)),
    attempt                  UInt16                          CODEC(T64, ZSTD(1)),
    version                  UInt16                          CODEC(T64, ZSTD(1)),
    selected                 Bool                            CODEC(T64, LZ4),
    reason                   LowCardinality(String)          CODEC(ZSTD(1)),
    inclusion_probability    Nullable(Float64)               CODEC(Gorilla, ZSTD(1)),
    hint_kinds               Array(LowCardinality(String))   CODEC(ZSTD(1)),
    outcome                  Nullable(String)                CODEC(ZSTD(1)),
    created_at               DateTime64(3, 'UTC')            CODEC(Delta(8), ZSTD(1)),
    retention_days           UInt16 DEFAULT 90               CODEC(T64, ZSTD(1))
)
ENGINE = ReplicatedMergeTree
PARTITION BY toYYYYMM(created_at)
PRIMARY KEY (organization_id, project_id, session_id, flagger_slug, analysis_hash, decision_id)
ORDER BY (organization_id, project_id, session_id, flagger_slug, analysis_hash, decision_id)
TTL toDateTime(created_at) + toIntervalDay(retention_days + 30) DELETE;

-- +goose Down

DROP TABLE IF EXISTS flagger_screening_decisions ON CLUSTER default;

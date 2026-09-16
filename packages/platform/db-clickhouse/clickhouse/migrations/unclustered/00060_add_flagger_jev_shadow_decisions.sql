-- +goose NO TRANSACTION
-- +goose Up

CREATE TABLE IF NOT EXISTS flagger_jev_shadow_observations
(
    observation_id            FixedString(64)                 CODEC(ZSTD(1)),
    organization_id           LowCardinality(FixedString(24)) CODEC(ZSTD(1)),
    project_id                LowCardinality(FixedString(24)) CODEC(ZSTD(1)),
    session_id                String                          CODEC(ZSTD(1)),
    flagger_slug              LowCardinality(String)          CODEC(ZSTD(1)),
    screening_decision_id     FixedString(64)                 CODEC(ZSTD(1)),
    analysis_hash             FixedString(64)                 CODEC(ZSTD(1)),
    scoring_artifact_version  LowCardinality(String)          CODEC(ZSTD(1)),
    screening_attempt         UInt16                          CODEC(T64, ZSTD(1)),
    screening_version         UInt16                          CODEC(T64, ZSTD(1)),
    workflow_id               String                          CODEC(ZSTD(1)),
    workflow_run_id           String                          CODEC(ZSTD(1)),
    activity_id               String                          CODEC(ZSTD(1)),
    activity_attempt          UInt16                          CODEC(T64, ZSTD(1)),
    state_hash                FixedString(64)                 CODEC(ZSTD(1)),
    state_builder_version     LowCardinality(String)          CODEC(ZSTD(1)),
    state_truncated           Bool                            CODEC(T64, LZ4),
    provider                  LowCardinality(String)          CODEC(ZSTD(1)),
    requested_model           Nullable(String)                CODEC(ZSTD(1)),
    resolved_model            Nullable(String)                CODEC(ZSTD(1)),
    question_version          LowCardinality(String)          CODEC(ZSTD(1)),
    policy_version            LowCardinality(String)          CODEC(ZSTD(1)),
    threshold                 Float64                         CODEC(Gorilla, ZSTD(1)),
    probability               Nullable(Float64)               CODEC(Gorilla, ZSTD(1)),
    advisory_decision         LowCardinality(String)          CODEC(ZSTD(1)),
    status                    LowCardinality(String)          CODEC(ZSTD(1)),
    error_category            Nullable(String)                CODEC(ZSTD(1)),
    latency_ms                Nullable(UInt32)                CODEC(T64, ZSTD(1)),
    input_tokens              Nullable(UInt32)                CODEC(T64, ZSTD(1)),
    output_tokens             Nullable(UInt32)                CODEC(T64, ZSTD(1)),
    selection_reason          LowCardinality(String)          CODEC(ZSTD(1)),
    selection_probability     Nullable(Float64)               CODEC(Gorilla, ZSTD(1)),
    observed_at               DateTime64(3, 'UTC')            CODEC(Delta(8), ZSTD(1)),
    retention_days            UInt16 DEFAULT 90               CODEC(T64, ZSTD(1)),
    recorded_at               DateTime64(3, 'UTC') DEFAULT now64(3) CODEC(Delta(8), LZ4)
)
ENGINE = ReplacingMergeTree(activity_attempt)
PARTITION BY organization_id
PRIMARY KEY (organization_id, project_id, session_id, flagger_slug, analysis_hash, observation_id)
ORDER BY (organization_id, project_id, session_id, flagger_slug, analysis_hash, observation_id)
TTL toDateTime(observed_at) + toIntervalDay(retention_days + 30) DELETE;

-- +goose Down

DROP TABLE IF EXISTS flagger_jev_shadow_observations;

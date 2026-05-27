-- +goose NO TRANSACTION
-- +goose Up

ALTER TABLE conversation_session_analyses
    ADD COLUMN IF NOT EXISTS segmentation_version LowCardinality(String) DEFAULT '' CODEC(ZSTD(1)),
    ADD COLUMN IF NOT EXISTS projection_version LowCardinality(String) DEFAULT '' CODEC(ZSTD(1));

CREATE TABLE IF NOT EXISTS conversation_semantic_moments
(
    organization_id       LowCardinality(String) CODEC(ZSTD(1)),
    project_id            LowCardinality(String) CODEC(ZSTD(1)),
    session_id            String                 CODEC(ZSTD(1)),
    analysis_hash         FixedString(64)        CODEC(ZSTD(1)),
    moment_id             String                 CODEC(ZSTD(1)),
    trace_id              FixedString(32)        CODEC(ZSTD(1)),
    start_time            DateTime64(9, 'UTC')   CODEC(Delta(8), ZSTD(1)),
    end_time              DateTime64(9, 'UTC')   CODEC(Delta(8), ZSTD(1)),
    first_message_index   UInt16                 CODEC(T64, ZSTD(1)),
    last_message_index    UInt16                 CODEC(T64, ZSTD(1)),
    boundary_reason       LowCardinality(String) CODEC(ZSTD(1)),
    embedding             Array(Float32)         CODEC(ZSTD(1)),
    coherence_score       Float32                DEFAULT 0.0 CODEC(ZSTD(1)),
    segmentation_method   LowCardinality(String) CODEC(ZSTD(1)),
    segmentation_version  LowCardinality(String) CODEC(ZSTD(1)),
    retention_days        UInt16                 DEFAULT 90 CODEC(T64, ZSTD(1)),
    indexed_at            DateTime64(3, 'UTC')   DEFAULT now64(3) CODEC(Delta(8), LZ4)
)
ENGINE = ReplacingMergeTree(indexed_at)
PARTITION BY toYYYYMM(start_time)
PRIMARY KEY (organization_id, project_id, session_id, analysis_hash, moment_id)
ORDER BY (organization_id, project_id, session_id, analysis_hash, moment_id)
TTL toDateTime(start_time) + toIntervalDay(retention_days + 30) DELETE;

CREATE TABLE IF NOT EXISTS conversation_moment_labels
(
    organization_id       LowCardinality(String) CODEC(ZSTD(1)),
    project_id            LowCardinality(String) CODEC(ZSTD(1)),
    session_id            String                 CODEC(ZSTD(1)),
    analysis_hash         FixedString(64)        CODEC(ZSTD(1)),
    label_id              String                 CODEC(ZSTD(1)),
    moment_id             String                 CODEC(ZSTD(1)),
    kind                  LowCardinality(String) CODEC(ZSTD(1)),
    actor                 LowCardinality(String) CODEC(ZSTD(1)),
    first_message_index   UInt16                 CODEC(T64, ZSTD(1)),
    last_message_index    UInt16                 CODEC(T64, ZSTD(1)),
    summary               String                 DEFAULT '' CODEC(ZSTD(3)),
    evidence              String                 CODEC(ZSTD(3)),
    confidence            Float32                DEFAULT 0.0 CODEC(ZSTD(1)),
    detector_version      LowCardinality(String) CODEC(ZSTD(1)),
    retention_days        UInt16                 DEFAULT 90 CODEC(T64, ZSTD(1)),
    indexed_at            DateTime64(3, 'UTC')   DEFAULT now64(3) CODEC(Delta(8), LZ4)
)
ENGINE = ReplacingMergeTree(indexed_at)
PARTITION BY toYYYYMM(indexed_at)
PRIMARY KEY (organization_id, project_id, session_id, analysis_hash, label_id)
ORDER BY (organization_id, project_id, session_id, analysis_hash, label_id)
TTL toDateTime(indexed_at) + toIntervalDay(retention_days + 30) DELETE;

CREATE TABLE IF NOT EXISTS taxonomy_observations
(
    organization_id           LowCardinality(String) CODEC(ZSTD(1)),
    project_id                LowCardinality(String) CODEC(ZSTD(1)),
    observation_id            String                 CODEC(ZSTD(1)),
    session_id                String                 CODEC(ZSTD(1)),
    analysis_hash             FixedString(64)        CODEC(ZSTD(1)),
    moment_id                 String                 CODEC(ZSTD(1)),
    dimension                 LowCardinality(String) CODEC(ZSTD(1)),
    projection_method         LowCardinality(String) CODEC(ZSTD(1)),
    projection_hash           FixedString(64)        CODEC(ZSTD(1)),
    projection_metadata       String                 DEFAULT '{}' CODEC(ZSTD(3)),
    embedding                 Array(Float32)         CODEC(ZSTD(1)),
    assigned_cluster_id       String                 DEFAULT '' CODEC(ZSTD(1)),
    assignment_confidence     Float32                DEFAULT 0.0 CODEC(ZSTD(1)),
    assignment_method         LowCardinality(String) DEFAULT '' CODEC(ZSTD(1)),
    reassignment_run_id       String                 DEFAULT '' CODEC(ZSTD(1)),
    start_time                DateTime64(9, 'UTC')   CODEC(Delta(8), ZSTD(1)),
    end_time                  DateTime64(9, 'UTC')   CODEC(Delta(8), ZSTD(1)),
    retention_days            UInt16                 DEFAULT 90 CODEC(T64, ZSTD(1)),
    indexed_at                DateTime64(3, 'UTC')   DEFAULT now64(3) CODEC(Delta(8), LZ4)
)
ENGINE = ReplacingMergeTree(indexed_at)
PARTITION BY toYYYYMM(start_time)
PRIMARY KEY (organization_id, project_id, dimension, observation_id)
ORDER BY (organization_id, project_id, dimension, observation_id)
TTL toDateTime(start_time) + toIntervalDay(retention_days + 30) DELETE;

-- +goose Down

DROP TABLE IF EXISTS taxonomy_observations;
DROP TABLE IF EXISTS conversation_moment_labels;
DROP TABLE IF EXISTS conversation_semantic_moments;

ALTER TABLE conversation_session_analyses
    DROP COLUMN IF EXISTS projection_version,
    DROP COLUMN IF EXISTS segmentation_version;

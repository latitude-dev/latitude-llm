-- +goose NO TRANSACTION
-- +goose Up

CREATE TABLE IF NOT EXISTS session_analyses ON CLUSTER default
(
    organization_id        LowCardinality(String) CODEC(ZSTD(1)),
    project_id             LowCardinality(String) CODEC(ZSTD(1)),
    session_id             String                 CODEC(ZSTD(1)),
    start_time             DateTime64(9, 'UTC')   CODEC(Delta(8), ZSTD(1)),
    end_time               DateTime64(9, 'UTC')   CODEC(Delta(8), ZSTD(1)),
    trace_ids              Array(FixedString(32)) CODEC(ZSTD(1)),
    analysis_hash          FixedString(64)        CODEC(ZSTD(1)),
    analysis_status        LowCardinality(String) CODEC(ZSTD(1)),
    status_reason          String                 DEFAULT '' CODEC(ZSTD(3)),
    retention_days         UInt16                 DEFAULT 90 CODEC(T64, ZSTD(1)),
    indexed_at             DateTime64(3, 'UTC')   DEFAULT now64(3) CODEC(Delta(8), LZ4)
)
ENGINE = ReplicatedReplacingMergeTree(indexed_at)
PARTITION BY toYYYYMM(start_time)
PRIMARY KEY (organization_id, project_id, session_id)
ORDER BY (organization_id, project_id, session_id)
TTL toDateTime(start_time) + toIntervalDay(retention_days + 30) DELETE;

CREATE TABLE IF NOT EXISTS session_semantic_moments ON CLUSTER default
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
    retention_days        UInt16                 DEFAULT 90 CODEC(T64, ZSTD(1)),
    indexed_at            DateTime64(3, 'UTC')   DEFAULT now64(3) CODEC(Delta(8), LZ4)
)
ENGINE = ReplicatedReplacingMergeTree(indexed_at)
PARTITION BY toYYYYMM(start_time)
PRIMARY KEY (organization_id, project_id, session_id, analysis_hash, moment_id)
ORDER BY (organization_id, project_id, session_id, analysis_hash, moment_id)
TTL toDateTime(start_time) + toIntervalDay(retention_days + 30) DELETE;

CREATE TABLE IF NOT EXISTS session_moment_labels ON CLUSTER default
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
    retention_days        UInt16                 DEFAULT 90 CODEC(T64, ZSTD(1)),
    indexed_at            DateTime64(3, 'UTC')   DEFAULT now64(3) CODEC(Delta(8), LZ4)
)
ENGINE = ReplicatedReplacingMergeTree(indexed_at)
PARTITION BY toYYYYMM(indexed_at)
PRIMARY KEY (organization_id, project_id, session_id, analysis_hash, label_id)
ORDER BY (organization_id, project_id, session_id, analysis_hash, label_id)
TTL toDateTime(indexed_at) + toIntervalDay(retention_days + 30) DELETE;

CREATE TABLE IF NOT EXISTS taxonomy_observations ON CLUSTER default
(
    organization_id           LowCardinality(String) CODEC(ZSTD(1)),
    project_id                LowCardinality(String) CODEC(ZSTD(1)),
    observation_id            String                 CODEC(ZSTD(1)),
    session_id                String                 CODEC(ZSTD(1)),
    analysis_hash             FixedString(64)        CODEC(ZSTD(1)),
    moment_id                 String                 CODEC(ZSTD(1)),
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
    indexed_at                DateTime64(3, 'UTC')   DEFAULT now64(3) CODEC(Delta(8), LZ4),
    INDEX idx_taxonomy_observations_session_id session_id TYPE bloom_filter(0.01) GRANULARITY 4,
    INDEX idx_taxonomy_observations_analysis_hash analysis_hash TYPE bloom_filter(0.01) GRANULARITY 4,
    INDEX idx_taxonomy_observations_observation_id observation_id TYPE bloom_filter(0.01) GRANULARITY 4,
    INDEX idx_taxonomy_observations_cluster_id assigned_cluster_id TYPE bloom_filter(0.01) GRANULARITY 4
)
ENGINE = ReplicatedReplacingMergeTree(indexed_at)
PARTITION BY toYYYYMM(start_time)
PRIMARY KEY (organization_id, project_id, observation_id)
ORDER BY (organization_id, project_id, observation_id)
TTL toDateTime(start_time) + toIntervalDay(retention_days + 30) DELETE;

-- +goose Down

DROP TABLE IF EXISTS taxonomy_observations ON CLUSTER default;
DROP TABLE IF EXISTS session_moment_labels ON CLUSTER default;
DROP TABLE IF EXISTS session_semantic_moments ON CLUSTER default;
DROP TABLE IF EXISTS session_analyses ON CLUSTER default;

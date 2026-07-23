-- +goose NO TRANSACTION
-- +goose Up

-- Scoped-cluster assignments for custom behaviors. Mirrors taxonomy_observations
-- but keyed by custom_behavior_id so a behavior's scoped tree never mutates the
-- global taxonomy_observations.assigned_cluster_id. Phase 2 writes it; Phase 3 reads it.
CREATE TABLE IF NOT EXISTS custom_behavior_assignments
(
    organization_id           LowCardinality(String) CODEC(ZSTD(1)),
    project_id                LowCardinality(String) CODEC(ZSTD(1)),
    custom_behavior_id        LowCardinality(String) CODEC(ZSTD(1)),
    observation_id            String                 CODEC(ZSTD(1)),
    session_id                String                 CODEC(ZSTD(1)),
    assigned_cluster_id       String                 DEFAULT '' CODEC(ZSTD(1)),
    assignment_confidence     Float32                DEFAULT 0.0 CODEC(ZSTD(1)),
    assignment_method         LowCardinality(String) DEFAULT '' CODEC(ZSTD(1)),
    reassignment_run_id       String                 DEFAULT '' CODEC(ZSTD(1)),
    start_time                DateTime64(9, 'UTC')   CODEC(Delta(8), ZSTD(1)),
    retention_days            UInt16                 DEFAULT 90 CODEC(T64, ZSTD(1)),
    indexed_at                DateTime64(3, 'UTC')   DEFAULT now64(3) CODEC(Delta(8), LZ4),
    INDEX idx_custom_behavior_assignments_session_id session_id TYPE bloom_filter(0.01) GRANULARITY 4,
    INDEX idx_custom_behavior_assignments_observation_id observation_id TYPE bloom_filter(0.01) GRANULARITY 4,
    INDEX idx_custom_behavior_assignments_cluster_id assigned_cluster_id TYPE bloom_filter(0.01) GRANULARITY 4
)
ENGINE = ReplacingMergeTree(indexed_at)
PARTITION BY toYYYYMM(start_time)
PRIMARY KEY (organization_id, project_id, custom_behavior_id, observation_id)
ORDER BY (organization_id, project_id, custom_behavior_id, observation_id)
TTL toDateTime(start_time) + toIntervalDay(retention_days + 30) DELETE;

-- +goose Down

DROP TABLE IF EXISTS custom_behavior_assignments;

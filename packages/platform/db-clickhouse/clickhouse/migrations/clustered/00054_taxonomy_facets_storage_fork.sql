-- +goose NO TRANSACTION
-- +goose Up

-- Generalize the empty custom_behavior_assignments edges table into
-- taxonomy_view_assignments: one edges table for every non-online tree. A facet
-- projection fans out to many views, so membership is a per-view edge keyed by
-- (custom_behavior_id, facet_id). facet_id = '' = topic (edges resolve vs
-- taxonomy_observations); set = facet (edges resolve vs taxonomy_facet_projections).
-- Clean recreate under the new name — the source table has 0 production rows.
DROP TABLE IF EXISTS custom_behavior_assignments ON CLUSTER default;

CREATE TABLE IF NOT EXISTS taxonomy_view_assignments ON CLUSTER default
(
    organization_id           LowCardinality(String) CODEC(ZSTD(1)),
    project_id                LowCardinality(String) CODEC(ZSTD(1)),
    custom_behavior_id        LowCardinality(String) CODEC(ZSTD(1)),
    facet_id                  LowCardinality(String) DEFAULT '' CODEC(ZSTD(1)),
    observation_id            String                 CODEC(ZSTD(1)),
    session_id                String                 CODEC(ZSTD(1)),
    assigned_cluster_id       String                 DEFAULT '' CODEC(ZSTD(1)),
    assignment_confidence     Float32                DEFAULT 0.0 CODEC(ZSTD(1)),
    assignment_method         LowCardinality(String) DEFAULT '' CODEC(ZSTD(1)),
    reassignment_run_id       String                 DEFAULT '' CODEC(ZSTD(1)),
    start_time                DateTime64(9, 'UTC')   CODEC(Delta(8), ZSTD(1)),
    retention_days            UInt16                 DEFAULT 90 CODEC(T64, ZSTD(1)),
    indexed_at                DateTime64(3, 'UTC')   DEFAULT now64(3) CODEC(Delta(8), LZ4),
    INDEX idx_taxonomy_view_assignments_session_id session_id TYPE bloom_filter(0.01) GRANULARITY 4,
    INDEX idx_taxonomy_view_assignments_observation_id observation_id TYPE bloom_filter(0.01) GRANULARITY 4,
    INDEX idx_taxonomy_view_assignments_cluster_id assigned_cluster_id TYPE bloom_filter(0.01) GRANULARITY 4
)
ENGINE = ReplicatedReplacingMergeTree(indexed_at)
PARTITION BY toYYYYMM(start_time)
PRIMARY KEY (organization_id, project_id, custom_behavior_id, facet_id, observation_id)
ORDER BY (organization_id, project_id, custom_behavior_id, facet_id, observation_id)
TTL toDateTime(start_time) + toIntervalDay(retention_days + 30) DELETE;

-- Facet projections: a session's embedding + one-sentence extracted answer under
-- one facet. Facet-global (extracted once per (facet, session), shared by every
-- view), so it carries NO inline cluster assignment. Cache key (session, facet);
-- facets are immutable, so projections never need invalidating.
CREATE TABLE IF NOT EXISTS taxonomy_facet_projections ON CLUSTER default
(
    organization_id           LowCardinality(String) CODEC(ZSTD(1)),
    project_id                LowCardinality(String) CODEC(ZSTD(1)),
    facet_id                  LowCardinality(String) CODEC(ZSTD(1)),
    session_observation_id    String                 CODEC(ZSTD(1)),
    session_id                String                 CODEC(ZSTD(1)),
    extracted_text            String                 DEFAULT '' CODEC(ZSTD(3)),
    analysis_hash             FixedString(64)        CODEC(ZSTD(1)),
    embedding                 Array(Float32)         CODEC(ZSTD(1)),
    start_time                DateTime64(9, 'UTC')   CODEC(Delta(8), ZSTD(1)),
    retention_days            UInt16                 DEFAULT 90 CODEC(T64, ZSTD(1)),
    indexed_at                DateTime64(3, 'UTC')   DEFAULT now64(3) CODEC(Delta(8), LZ4),
    INDEX idx_taxonomy_facet_projections_session_id session_id TYPE bloom_filter(0.01) GRANULARITY 4,
    INDEX idx_taxonomy_facet_projections_session_observation_id session_observation_id TYPE bloom_filter(0.01) GRANULARITY 4,
    INDEX idx_taxonomy_facet_projections_analysis_hash analysis_hash TYPE bloom_filter(0.01) GRANULARITY 4
)
ENGINE = ReplicatedReplacingMergeTree(indexed_at)
PARTITION BY toYYYYMM(start_time)
PRIMARY KEY (organization_id, project_id, facet_id, session_observation_id)
ORDER BY (organization_id, project_id, facet_id, session_observation_id)
TTL toDateTime(start_time) + toIntervalDay(retention_days + 30) DELETE;

-- +goose Down

DROP TABLE IF EXISTS taxonomy_facet_projections ON CLUSTER default;
DROP TABLE IF EXISTS taxonomy_view_assignments ON CLUSTER default;

CREATE TABLE IF NOT EXISTS custom_behavior_assignments ON CLUSTER default
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
ENGINE = ReplicatedReplacingMergeTree(indexed_at)
PARTITION BY toYYYYMM(start_time)
PRIMARY KEY (organization_id, project_id, custom_behavior_id, observation_id)
ORDER BY (organization_id, project_id, custom_behavior_id, observation_id)
TTL toDateTime(start_time) + toIntervalDay(retention_days + 30) DELETE;

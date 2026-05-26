-- +goose NO TRANSACTION
-- +goose Up

-- ═══════════════════════════════════════════════════════════════════════════════
-- Behavior Observations — Per-Session Taxonomy Stream
-- ═══════════════════════════════════════════════════════════════════════════════
-- Stores one row per (organization_id, project_id, session_id) describing the
-- session's behavior summary, embedding, and current taxonomy-cluster
-- assignment. Mirrors `trace_search_embeddings` exactly:
--
--   * `ReplacingMergeTree(indexed_at)` so reassignments collapse into one row.
--   * Org-first sort prefix `(organization_id, project_id, session_id)` so
--     project-scoped reads scan only the tenant's data.
--   * Monthly partitions on `toYYYYMM(start_time)`.
--   * Per-row `retention_days` with a 30-day grace buffer on the TTL,
--     matching the trace-search retention policy.
--
-- The noise bucket is the predicate `assigned_cluster_id = ''` — a single
-- index-friendly filter on the existing table, no second storage surface.
--
-- Embedding column is `Array(Float32)` with no fixed dimension. Matches the
-- proven trace-search shape; a future model swap rewrites rows without a
-- table rebuild.

CREATE TABLE IF NOT EXISTS behavior_observations ON CLUSTER default
(
    organization_id           LowCardinality(String) CODEC(ZSTD(1)),
    project_id                LowCardinality(String) CODEC(ZSTD(1)),

    -- Canonical synthesized session id from
    -- `specs/session-problems/1-parity-traces-sessions.md`: orphan traces
    -- become 1-trace sessions via `coalesce(nullIf(session_id, ''), toString(trace_id))`.
    session_id                String                 CODEC(ZSTD(1)),

    start_time                DateTime64(9, 'UTC')   CODEC(Delta(8), ZSTD(1)),
    end_time                  DateTime64(9, 'UTC')   CODEC(Delta(8), ZSTD(1)),

    -- Constituent trace ids for the session — used by the read side to
    -- jump from a clustered observation back to the underlying traces.
    trace_ids                 Array(FixedString(32)) CODEC(ZSTD(1)),

    -- 1-sentence intent summary (LLM-summary path) or the first 280 chars
    -- of the conversation text (embed-direct path). Stored regardless of
    -- branch so the FPS-sampled naming pass has examples to map+reduce.
    summary                   String                 CODEC(ZSTD(3)),

    -- SHA-256 of the canonical session document. Drives both the summary
    -- cache (skip the LLM call on repeated trace ingest) and the embed
    -- cache key. 64 hex chars.
    summary_hash              FixedString(64)        CODEC(ZSTD(1)),

    -- May be empty (length 0) when the session was below
    -- TAXONOMY_SESSION_MIN_LENGTH; those rows are visible to the noise
    -- sweep but excluded by `length(embedding) > 0`.
    embedding                 Array(Float32)         CODEC(ZSTD(1)),
    embedding_model           LowCardinality(String) CODEC(ZSTD(1)),

    -- Empty string = noise bucket. Otherwise a cuid pointing at
    -- taxonomy_clusters.id.
    assigned_cluster_id       String                 DEFAULT '' CODEC(ZSTD(1)),
    assignment_confidence     Float32                DEFAULT 0.0 CODEC(ZSTD(1)),

    -- 'centroid_online' | 'gardening_birth' | 'gardening_reassign' | 'noise'
    assignment_method         LowCardinality(String) DEFAULT '' CODEC(ZSTD(1)),

    -- Set when a gardening run produced this row's current assignment.
    reassignment_run_id       String                 DEFAULT '' CODEC(ZSTD(1)),

    retention_days            UInt16                 DEFAULT 90 CODEC(T64, ZSTD(1)),
    indexed_at                DateTime64(3, 'UTC')   DEFAULT now64(3) CODEC(Delta(8), LZ4)
)
ENGINE = ReplicatedReplacingMergeTree(indexed_at)
PARTITION BY toYYYYMM(start_time)
PRIMARY KEY (organization_id, project_id, session_id)
ORDER BY (organization_id, project_id, session_id)
TTL toDateTime(start_time) + toIntervalDay(retention_days + 30) DELETE;

-- +goose Down

DROP TABLE IF EXISTS behavior_observations ON CLUSTER default;

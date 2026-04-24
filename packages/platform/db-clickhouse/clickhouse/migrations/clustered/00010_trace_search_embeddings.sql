-- +goose NO TRANSACTION
-- +goose Up

-- ═══════════════════════════════════════════════════════════════════════════════
-- Trace Search Embeddings (Semantic Search) - Clustered
-- ═══════════════════════════════════════════════════════════════════════════════
-- Stores embeddings for traces eligible for semantic search.
-- Retention is enforced by the TTL clause below; there is no per-project cap.

CREATE TABLE IF NOT EXISTS trace_search_embeddings ON CLUSTER default
(
    organization_id    LowCardinality(String)                CODEC(ZSTD(1)),
    project_id         LowCardinality(String)                CODEC(ZSTD(1)),
    trace_id           FixedString(32)                       CODEC(ZSTD(1)),

    start_time         DateTime64(9, 'UTC')                  CODEC(Delta(8), ZSTD(1)),

    -- Deterministic hash of content for deduplication
    content_hash       FixedString(64)                       CODEC(ZSTD(1)),

    -- Embedding model identifier (e.g., "voyage-4-large")
    embedding_model    LowCardinality(String)                CODEC(ZSTD(1)),

    -- Vector embedding for semantic similarity search
    -- Dimensions are fixed at the model's output (2048 for voyage-4-large)
    embedding          Array(Float32)                        CODEC(ZSTD(1)),

    -- Version column for ReplacingMergeTree deduplication
    indexed_at         DateTime64(3, 'UTC')     DEFAULT now64(3) CODEC(Delta(8), LZ4)
)
ENGINE = ReplicatedReplacingMergeTree(indexed_at)
PARTITION BY toYYYYMM(start_time)
PRIMARY KEY (organization_id, project_id, trace_id)
ORDER BY (organization_id, project_id, trace_id)
TTL start_time + INTERVAL 30 DAY DELETE;

-- +goose Down
DROP TABLE IF EXISTS trace_search_embeddings ON CLUSTER default;

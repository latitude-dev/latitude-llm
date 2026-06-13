-- +goose NO TRANSACTION
-- +goose Up

CREATE TABLE IF NOT EXISTS message_embeddings ON CLUSTER default
(
    organization_id    LowCardinality(String)                CODEC(ZSTD(1)),
    project_id         LowCardinality(String)                CODEC(ZSTD(1)),
    content_hash       String                                CODEC(ZSTD(1)),
    -- Dimensions are fixed at the model's output (2048 for voyage-4-large).
    embedding          Array(Float32)                        CODEC(NONE),
    -- Embedding model identifier (e.g. voyage-4-large).
    embedding_model    LowCardinality(String)                CODEC(ZSTD(1)),
    inserted_at        DateTime64(3, 'UTC') DEFAULT now64(3) CODEC(Delta(8), LZ4),
    retention_days     UInt16               DEFAULT 90       CODEC(T64, ZSTD(1)),
    -- WARNING: the 2048 below is the voyage-4-large output dimension and is
    -- hard-coded into both the CHECK and the HNSW index (ClickHouse requires a
    -- literal). Overriding LAT_AI_EMBEDDING_MODEL/PROVIDER to a model with a
    -- different dimension makes EVERY insert fail this CHECK. Changing the model
    -- therefore requires a new migration that drops/recreates this table at the
    -- new dimension — it cannot be flipped via env alone.
    CONSTRAINT message_embedding_dimensions CHECK length(embedding) = 2048,
    INDEX idx_message_embedding_hnsw embedding TYPE vector_similarity('hnsw', 'cosineDistance', 2048)
)
-- ReplacingMergeTree (no version column — duplicate vectors are byte-identical)
-- collapses race-loser rows from upsertMany's check-then-insert: ClickHouse has
-- no unique constraint, so two indexers can both miss and both insert the same
-- (org, project, model, content_hash). The partition key is a prefix of the
-- sort key, so all duplicates of a hash land in the same partition and merge
-- away. Dedup is eventual; reads tolerate transient dupes (worker dedups by
-- hash in a Map, semantic search GROUPs BY trace_id).
ENGINE = ReplicatedReplacingMergeTree
PARTITION BY (organization_id, project_id, embedding_model)
PRIMARY KEY (organization_id, project_id, embedding_model, content_hash)
ORDER BY (organization_id, project_id, embedding_model, content_hash)
-- Same retention as the source spans (retention_days + 30 grace, default 90).
-- Vectors are immutable, so the TTL anchors on inserted_at rather than a
-- refreshed last-seen; if a vector expires while still referenced, the next
-- trace-search/CI pass re-embeds it on miss and write-through recreates it.
TTL toDateTime(inserted_at) + toIntervalDay(retention_days + 30) DELETE;

-- +goose Down

DROP TABLE IF EXISTS message_embeddings ON CLUSTER default;

-- +goose NO TRANSACTION
-- +goose Up

CREATE TABLE IF NOT EXISTS message_embeddings ON CLUSTER default
(
    organization_id    LowCardinality(String)                CODEC(ZSTD(1)),
    project_id         LowCardinality(String)                CODEC(ZSTD(1)),
    content_hash       String                                CODEC(ZSTD(1)),
    -- Dimensions are fixed at the model's output (2048 for voyage-4-large).
    embedding          Array(Float32)                        CODEC(ZSTD(1)),
    -- Embedding model identifier (e.g. voyage-4-large).
    embedding_model    LowCardinality(String)                CODEC(ZSTD(1)),
    last_seen_at       DateTime64(3, 'UTC') DEFAULT now64(3) CODEC(Delta(8), LZ4)
)
ENGINE = ReplicatedReplacingMergeTree(last_seen_at)
PARTITION BY toYYYYMM(last_seen_at)
PRIMARY KEY (organization_id, project_id, content_hash)
ORDER BY (organization_id, project_id, content_hash)
TTL toDateTime(last_seen_at) + INTERVAL 90 DAY DELETE;

-- +goose Down

DROP TABLE IF EXISTS message_embeddings ON CLUSTER default;

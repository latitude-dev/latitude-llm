-- +goose NO TRANSACTION
-- +goose Up

CREATE TABLE IF NOT EXISTS message_embeddings ON CLUSTER default
(
    organization_id    LowCardinality(String)                CODEC(ZSTD(1)),
    project_id         LowCardinality(String)                CODEC(ZSTD(1)),
    content_hash       String                                CODEC(ZSTD(1)),
    embedding          Array(Float32)                        CODEC(NONE),
    embedding_model    LowCardinality(String)                CODEC(ZSTD(1)),
    inserted_at        DateTime64(3, 'UTC') DEFAULT now64(3) CODEC(Delta(8), LZ4),
    CONSTRAINT message_embedding_dimensions CHECK length(embedding) = 2048,
    INDEX idx_message_embedding_hnsw embedding TYPE vector_similarity('hnsw', 'cosineDistance', 2048)
)
ENGINE = ReplicatedMergeTree
PARTITION BY (organization_id, project_id, embedding_model)
PRIMARY KEY (organization_id, project_id, embedding_model, content_hash)
ORDER BY (organization_id, project_id, embedding_model, content_hash);

-- +goose Down

DROP TABLE IF EXISTS message_embeddings ON CLUSTER default;

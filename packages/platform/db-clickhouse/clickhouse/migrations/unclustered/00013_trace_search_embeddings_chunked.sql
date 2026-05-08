-- +goose NO TRANSACTION
-- +goose Up

-- See clustered/00013 for the rationale.

CREATE TABLE IF NOT EXISTS trace_search_embeddings_chunked
(
    organization_id    LowCardinality(String)                CODEC(ZSTD(1)),
    project_id         LowCardinality(String)                CODEC(ZSTD(1)),
    trace_id           FixedString(32)                       CODEC(ZSTD(1)),
    chunk_index        UInt16                                CODEC(T64, ZSTD(1)),
    start_time         DateTime64(9, 'UTC')                  CODEC(Delta(8), ZSTD(1)),
    content_hash       FixedString(64)                       CODEC(ZSTD(1)),
    embedding_model    LowCardinality(String)                CODEC(ZSTD(1)),
    embedding          Array(Float32)                        CODEC(ZSTD(1)),
    indexed_at         DateTime64(3, 'UTC')     DEFAULT now64(3) CODEC(Delta(8), LZ4),
    retention_days     UInt16                   DEFAULT 30   CODEC(T64, ZSTD(1))
)
ENGINE = ReplacingMergeTree(indexed_at)
PARTITION BY toYYYYMM(start_time)
PRIMARY KEY (organization_id, project_id, trace_id, chunk_index)
ORDER BY (organization_id, project_id, trace_id, chunk_index)
TTL toDateTime(start_time) + toIntervalDay(retention_days + 30) DELETE;

RENAME TABLE
    trace_search_embeddings         TO trace_search_embeddings_legacy,
    trace_search_embeddings_chunked TO trace_search_embeddings;

-- +goose Down

RENAME TABLE
    trace_search_embeddings        TO trace_search_embeddings_chunked,
    trace_search_embeddings_legacy TO trace_search_embeddings;

DROP TABLE IF EXISTS trace_search_embeddings_chunked;

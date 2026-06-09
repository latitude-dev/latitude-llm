-- +goose NO TRANSACTION
-- +goose Up

CREATE TABLE IF NOT EXISTS session_search_documents
(
    organization_id    LowCardinality(String)                CODEC(ZSTD(1)),
    project_id         LowCardinality(String)                CODEC(ZSTD(1)),
    session_id         String                                CODEC(ZSTD(1)),
    start_time         DateTime64(9, 'UTC')                  CODEC(Delta(8), ZSTD(1)),
    trace_ids          Array(FixedString(32))                CODEC(ZSTD(1)),
    root_span_name     LowCardinality(String)   DEFAULT ''   CODEC(ZSTD(1)),
    search_text        String                   DEFAULT ''   CODEC(ZSTD(3)),
    content_hash       FixedString(64)                       CODEC(ZSTD(1)),
    indexed_at         DateTime64(3, 'UTC')     DEFAULT now64(3) CODEC(Delta(8), LZ4),
    retention_days     UInt16                   DEFAULT 90 CODEC(T64, ZSTD(1)),

    INDEX idx_search_text_tokenbf search_text TYPE tokenbf_v1(32768, 3, 0) GRANULARITY 1,
    INDEX idx_search_text_ngrambf search_text TYPE ngrambf_v1(3, 512, 3, 0) GRANULARITY 1
)
ENGINE = ReplacingMergeTree(indexed_at)
PARTITION BY toYYYYMM(start_time)
PRIMARY KEY (organization_id, project_id, session_id)
ORDER BY (organization_id, project_id, session_id)
TTL toDateTime(start_time) + toIntervalDay(retention_days + 30) DELETE;

-- +goose Down

DROP TABLE IF EXISTS session_search_documents;

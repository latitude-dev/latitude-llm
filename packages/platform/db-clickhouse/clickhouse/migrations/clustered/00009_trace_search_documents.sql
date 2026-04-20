-- +goose NO TRANSACTION
-- +goose Up

-- ═══════════════════════════════════════════════════════════════════════════════
-- Trace Search Documents (Lexical Search) - Clustered
-- ═══════════════════════════════════════════════════════════════════════════════
-- Stores normalized searchable text from trace input/output messages.
-- Excludes system prompts entirely.
-- Uses tokenbf_v1 and ngrambf_v1 for lexical search on ClickHouse 25.2

CREATE TABLE IF NOT EXISTS trace_search_documents ON CLUSTER default
(
    organization_id    LowCardinality(String)                CODEC(ZSTD(1)),
    project_id         LowCardinality(String)                CODEC(ZSTD(1)),
    trace_id           FixedString(32)                       CODEC(ZSTD(1)),

    start_time         DateTime64(9, 'UTC')                  CODEC(Delta(8), ZSTD(1)),
    root_span_name     LowCardinality(String)   DEFAULT ''   CODEC(ZSTD(1)),

    -- Normalized searchable text from user input + assistant output messages
    -- Excludes system_instructions completely
    search_text        String                   DEFAULT ''   CODEC(ZSTD(3)),

    -- Deterministic hash of content to skip redundant embedding work
    content_hash       FixedString(64)                       CODEC(ZSTD(1)),

    -- Version column for ReplacingMergeTree deduplication
    indexed_at         DateTime64(3, 'UTC')     DEFAULT now64(3) CODEC(Delta(8), LZ4),

    -- ═════════════════════════════════════════════════════════════════════════
    -- LEXICAL INDEXES (tokenbf_v1 and ngrambf_v1 for ClickHouse 25.2)
    -- ═════════════════════════════════════════════════════════════════════════

    -- Token-based bloom filter for word/token lookup
    INDEX idx_search_text_tokenbf search_text TYPE tokenbf_v1(32768, 3, 0) GRANULARITY 1,

    -- N-gram bloom filter for substring inclusion (3-gram)
    INDEX idx_search_text_ngrambf search_text TYPE ngrambf_v1(3, 512, 3, 0) GRANULARITY 1
)
ENGINE = ReplicatedReplacingMergeTree(indexed_at)
PARTITION BY toYYYYMM(start_time)
PRIMARY KEY (organization_id, project_id, trace_id)
ORDER BY (organization_id, project_id, trace_id);

-- +goose Down
DROP TABLE IF EXISTS trace_search_documents ON CLUSTER default;

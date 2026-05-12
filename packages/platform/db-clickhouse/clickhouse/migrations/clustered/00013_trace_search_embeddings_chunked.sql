-- +goose NO TRANSACTION
-- +goose Up

-- ═══════════════════════════════════════════════════════════════════════════════
-- Trace Search Embeddings — Per-Chunk Shape
-- ═══════════════════════════════════════════════════════════════════════════════
-- Replaces the one-row-per-trace shape with one-row-per-chunk so a single trace
-- can carry multiple embeddings (one per conversation turn or grouped turn).
-- Retrieval rolls chunks back up via `max(cosineSimilarity) GROUP BY trace_id`.
--
-- ClickHouse rejects extending an existing ORDER BY with a pre-existing column,
-- so we can't ALTER the live table to add `chunk_index` to the PK in place.
-- Instead: create the new shape under a temporary name, then RENAME-swap. The
-- live name picks up the new shape (empty); old data sits in `_legacy` until
-- the deploy backfill job repopulates the new table from canonical traces.

CREATE TABLE IF NOT EXISTS trace_search_embeddings_chunked ON CLUSTER default
(
    organization_id    LowCardinality(String)                CODEC(ZSTD(1)),
    project_id         LowCardinality(String)                CODEC(ZSTD(1)),
    trace_id           FixedString(32)                       CODEC(ZSTD(1)),

    -- 0-based, contiguous within a trace. Together with (org, project, trace)
    -- forms the dedup key for ReplacingMergeTree.
    chunk_index        UInt16                                CODEC(T64, ZSTD(1)),

    start_time         DateTime64(9, 'UTC')                  CODEC(Delta(8), ZSTD(1)),

    -- Per-chunk content hash. A single chunk's content changing only re-embeds
    -- that chunk; its siblings keep their existing rows.
    content_hash       FixedString(64)                       CODEC(ZSTD(1)),

    embedding_model    LowCardinality(String)                CODEC(ZSTD(1)),
    embedding          Array(Float32)                        CODEC(ZSTD(1)),

    indexed_at         DateTime64(3, 'UTC')     DEFAULT now64(3) CODEC(Delta(8), LZ4),
    retention_days     UInt16                   DEFAULT 30   CODEC(T64, ZSTD(1))
)
ENGINE = ReplicatedReplacingMergeTree(indexed_at)
PARTITION BY toYYYYMM(start_time)
PRIMARY KEY (organization_id, project_id, trace_id, chunk_index)
ORDER BY (organization_id, project_id, trace_id, chunk_index)
TTL toDateTime(start_time) + toIntervalDay(retention_days + 30) DELETE;

-- Swap the live name to the new empty shape so writers / readers pick it up
-- automatically. Existing rows remain in `trace_search_embeddings_legacy`; run
-- the trace-search backfill job immediately in deploy to repopulate the new
-- table from trace data.
--
-- ClickHouse Cloud Shared databases reject multi-table RENAME statements, so
-- keep these as separate DDL statements instead of one atomic RENAME swap.
RENAME TABLE trace_search_embeddings TO trace_search_embeddings_legacy ON CLUSTER default;
RENAME TABLE trace_search_embeddings_chunked TO trace_search_embeddings ON CLUSTER default;

-- +goose Down

RENAME TABLE trace_search_embeddings TO trace_search_embeddings_chunked ON CLUSTER default;
RENAME TABLE trace_search_embeddings_legacy TO trace_search_embeddings ON CLUSTER default;

DROP TABLE IF EXISTS trace_search_embeddings_chunked ON CLUSTER default;

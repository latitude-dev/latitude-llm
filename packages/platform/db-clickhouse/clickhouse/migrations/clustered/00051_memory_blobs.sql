-- +goose NO TRANSACTION
-- +goose Up

-- Content-addressed record bodies (git's object store). Dedup is per-org by
-- content_hash; ReplacingMergeTree collapses identical hashes on merge. Bodies
-- are stored inline under ZSTD(3); content_file_key is reserved for a future
-- object-storage overflow (empty in Phase 1). No PARTITION BY: content-addressed
-- and small.
CREATE TABLE IF NOT EXISTS memory_blobs ON CLUSTER default
(
    organization_id  LowCardinality(String) CODEC(ZSTD(1)),
    content_hash     String                 CODEC(ZSTD(1)),
    content          String                 DEFAULT '' CODEC(ZSTD(3)),
    content_file_key String                 DEFAULT '' CODEC(ZSTD(1)),
    byte_size        UInt32                 DEFAULT 0  CODEC(T64, ZSTD(1)),
    token_count      UInt32                 DEFAULT 0  CODEC(T64, ZSTD(1)),
    created_at       DateTime64(3, 'UTC')   DEFAULT now64(3) CODEC(Delta(8), LZ4)
)
ENGINE = ReplicatedReplacingMergeTree(created_at)
PRIMARY KEY (organization_id, content_hash)
ORDER BY (organization_id, content_hash);

-- +goose Down

DROP TABLE IF EXISTS memory_blobs ON CLUSTER default;

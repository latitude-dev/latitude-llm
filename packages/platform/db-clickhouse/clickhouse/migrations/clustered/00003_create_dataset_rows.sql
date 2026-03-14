-- +goose NO TRANSACTION
-- +goose Up
CREATE TABLE IF NOT EXISTS dataset_rows ON CLUSTER default
(
    -- ═══════════════════════════════════════════════════════
    -- TENANCY & SCOPE
    -- ═══════════════════════════════════════════════════════

    organization_id          LowCardinality(String),
    dataset_id               LowCardinality(String),

    -- ═══════════════════════════════════════════════════════
    -- ROW IDENTITY & VERSIONING
    -- ═══════════════════════════════════════════════════════

    row_id                   String,

    -- Monotonic version number matching Postgres current_version.
    -- Each mutation appends a new row with incremented xact_id;
    -- latest state is resolved via argMax(col, xact_id).
    xact_id                  UInt64,

    created_at               DateTime64(3, 'UTC') DEFAULT now64(3),

    -- Tombstone flag: true means this row was soft-deleted at this xact_id.
    _object_delete           Bool DEFAULT false,

    -- ═══════════════════════════════════════════════════════
    -- PAYLOAD
    --
    -- Schemaless JSON. ZSTD(3) for maximum compression on
    -- potentially large user-generated content.
    -- ═══════════════════════════════════════════════════════

    input                    String DEFAULT ''                        CODEC(ZSTD(3)),
    output                   String DEFAULT ''                        CODEC(ZSTD(3)),
    metadata                 String DEFAULT ''                        CODEC(ZSTD(3)),

    -- ═══════════════════════════════════════════════════════
    -- SKIP INDEXES
    -- ═══════════════════════════════════════════════════════

    INDEX idx_row_id         row_id       TYPE bloom_filter GRANULARITY 1
)
ENGINE = ReplicatedMergeTree()
PARTITION BY (organization_id, toYYYYMM(created_at))
PRIMARY KEY (organization_id, dataset_id)
ORDER BY (organization_id, dataset_id, row_id, xact_id);

-- +goose Down
DROP TABLE IF EXISTS dataset_rows ON CLUSTER default;

-- +goose NO TRANSACTION
-- +goose Up
CREATE TABLE IF NOT EXISTS scores
(
    id              FixedString(24)                 CODEC(ZSTD(1)),            -- CUID score identifier
    organization_id LowCardinality(FixedString(24)) CODEC(ZSTD(1)),            -- owning organization CUID
    project_id      LowCardinality(FixedString(24)) CODEC(ZSTD(1)),            -- owning project CUID

    session_id      FixedString(128) DEFAULT ''     CODEC(ZSTD(1)),            -- optional session id inherited from instrumentation
    trace_id        FixedString(32) DEFAULT ''      CODEC(ZSTD(1)),            -- optional trace id inherited from instrumentation
    span_id         FixedString(16) DEFAULT ''      CODEC(ZSTD(1)),            -- optional span id inherited from instrumentation

    source          FixedString(32)                 CODEC(ZSTD(1)),            -- "evaluation" | "annotation" | "custom"
    source_id       FixedString(128)                CODEC(ZSTD(1)),            -- evaluation cuid, annotation queue cuid or sentinel `"UI"` / `"API"` values, or custom source tag, capped to 128 chars

    simulation_id   FixedString(24) DEFAULT ''      CODEC(ZSTD(1)),            -- optional simulation CUID link, empty string when absent
    issue_id        FixedString(24) DEFAULT ''      CODEC(ZSTD(1)),            -- optional issue CUID assignment, empty string when absent

    value           Float32                         CODEC(Gorilla, ZSTD(1)),   -- normalized [0, 1] score value
    passed          Bool                            CODEC(T64, LZ4),           -- true if passed, false if failed or errored
    errored         Bool                            CODEC(T64, LZ4),           -- true if errored, false if passed or failed

    duration        UInt64 DEFAULT 0                CODEC(T64, ZSTD(1)),       -- duration of score generation in nanoseconds
    tokens          UInt64 DEFAULT 0                CODEC(T64, ZSTD(1)),       -- total llm token usage for this score generation
    cost            UInt64 DEFAULT 0                CODEC(T64, ZSTD(1)),       -- total llm cost in microcents

    created_at      DateTime64(3, 'UTC')            CODEC(Delta(8), ZSTD(1)),  -- score creation time

    INDEX idx_source        source        TYPE set(3)             GRANULARITY 4,
    INDEX idx_source_id     source_id     TYPE bloom_filter(0.01) GRANULARITY 2,
    INDEX idx_issue_id      issue_id      TYPE bloom_filter(0.01) GRANULARITY 2,
    INDEX idx_simulation_id simulation_id TYPE bloom_filter(0.01) GRANULARITY 2,
    INDEX idx_trace_id      trace_id      TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_session_id    session_id    TYPE bloom_filter(0.01) GRANULARITY 2,
    INDEX idx_span_id       span_id       TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_passed        passed        TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_errored       errored       TYPE bloom_filter(0.01) GRANULARITY 1
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(created_at)
PRIMARY KEY (organization_id, project_id, created_at)
ORDER BY (
    organization_id,
    project_id,
    created_at,
    source,
    source_id,
    session_id,
    trace_id,
    span_id,
    id
);

-- +goose Down
DROP TABLE IF EXISTS scores;

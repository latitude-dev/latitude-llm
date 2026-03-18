-- +goose NO TRANSACTION
-- +goose Up
CREATE TABLE IF NOT EXISTS spans
(
    -- ═══════════════════════════════════════════════════════
    -- TENANCY & SCOPE
    -- ═══════════════════════════════════════════════════════

    organization_id          LowCardinality(String)                    CODEC(ZSTD(1)),
    project_id               LowCardinality(String)                    CODEC(ZSTD(1)),

    -- ═══════════════════════════════════════════════════════
    -- IDENTITY & HIERARCHY
    -- ═══════════════════════════════════════════════════════

    -- Stored as-is from gen_ai.conversation.id if present on the span.
    -- No server-side resolution or fallback assignment.
    -- Empty string means this span was not part of a named session.
    session_id               String   DEFAULT ''                       CODEC(ZSTD(1)),

    -- 32-hex OTEL trace ID. FixedString avoids per-value length prefix.
    trace_id                 FixedString(32)                           CODEC(ZSTD(1)),

    -- 16-hex OTEL span ID.
    span_id                  FixedString(16)                           CODEC(ZSTD(1)),

    -- Empty string for root spans (no parent).
    -- String instead of FixedString(16) because it is nullable in OTEL.
    parent_span_id           String   DEFAULT ''                       CODEC(ZSTD(1)),

    -- CUID2 of the API key that ingested this span.
    api_key_id               LowCardinality(String)   DEFAULT ''       CODEC(ZSTD(1)),

    -- ═══════════════════════════════════════════════════════
    -- TIMING
    -- ═══════════════════════════════════════════════════════

    start_time               DateTime64(9, 'UTC')                      CODEC(Delta(8), ZSTD(1)),
    end_time                 DateTime64(9, 'UTC')                      CODEC(Delta(8), ZSTD(1)),

    -- ALIAS: computed at read time, not stored.
    -- Use reinterpretAsInt64 directly in aggregations.
    duration_ns              ALIAS reinterpretAsInt64(end_time)
                                 - reinterpretAsInt64(start_time),

    -- ═══════════════════════════════════════════════════════
    -- SPAN METADATA
    -- ═══════════════════════════════════════════════════════

    name                     LowCardinality(String)                    CODEC(ZSTD(1)),
    service_name             LowCardinality(String)                    CODEC(ZSTD(1)),

    -- OTel SpanKind: 0=UNSPECIFIED 1=INTERNAL 2=SERVER 3=CLIENT
    --               4=PRODUCER    5=CONSUMER
    kind                     Int8                                      CODEC(T64, ZSTD(1)),

    -- OTel status: 0=UNSET 1=OK 2=ERROR
    status_code              Int16    DEFAULT 0                        CODEC(T64, ZSTD(1)),
    status_message           String   DEFAULT ''                       CODEC(ZSTD(1)),

    trace_flags              UInt32   DEFAULT 0                        CODEC(T64, LZ4),
    trace_state              String   DEFAULT ''                       CODEC(ZSTD(1)),

    -- Populated from error.type attribute when status_code = 2.
    error_type               LowCardinality(String)   DEFAULT ''       CODEC(ZSTD(1)),

    -- User-defined string labels.
    tags                     Array(LowCardinality(String)) DEFAULT []  CODEC(ZSTD(1)),

    -- Stored as JSON arrays — variable-length, not filterable.
    -- [ { name, timestamp, attributes: {} }, ... ]
    events_json              String   DEFAULT ''                       CODEC(ZSTD(1)),
    -- [ { trace_id, span_id, attributes: {} }, ... ]
    links_json               String   DEFAULT ''                       CODEC(ZSTD(1)),

    -- ═══════════════════════════════════════════════════════
    -- GENAI FIELDS
    --
    -- Sparse: non-LLM spans keep all defaults ('' / 0).
    -- No Nullable columns — defaults compress to near-zero bytes
    -- with T64 for numeric columns.
    -- ═══════════════════════════════════════════════════════

    operation                LowCardinality(String)   DEFAULT ''       CODEC(ZSTD(1)),  -- gen_ai.operation.name
    provider                 LowCardinality(String)   DEFAULT ''       CODEC(ZSTD(1)),  -- gen_ai.system
    model                    LowCardinality(String)   DEFAULT ''       CODEC(ZSTD(1)),  -- gen_ai.request.model
    response_model           LowCardinality(String)   DEFAULT ''       CODEC(ZSTD(1)),  -- gen_ai.response.model

    -- Token counts (gen_ai.usage.*)
    tokens_input             UInt32   DEFAULT 0                        CODEC(T64, ZSTD(1)),
    tokens_output            UInt32   DEFAULT 0                        CODEC(T64, ZSTD(1)),
    tokens_cache_read        UInt32   DEFAULT 0                        CODEC(T64, ZSTD(1)),
    tokens_cache_create      UInt32   DEFAULT 0                        CODEC(T64, ZSTD(1)),
    tokens_reasoning         UInt32   DEFAULT 0                        CODEC(T64, ZSTD(1)),

    -- MATERIALIZED: computed at insert time, stored on disk.
    -- Cannot be supplied in INSERT statements.
    tokens_total             UInt32   MATERIALIZED
                                 tokens_input + tokens_output + tokens_cache_read
                                 + tokens_cache_create + tokens_reasoning
                                                                       CODEC(T64, ZSTD(1)),

    -- Cost in microcents (1 USD = 100,000,000 microcents).
    -- cost_total is a regular column because some providers return a
    -- total that does not equal input + output exactly.
    cost_input_microcents    UInt64   DEFAULT 0                        CODEC(T64, ZSTD(1)),
    cost_output_microcents   UInt64   DEFAULT 0                        CODEC(T64, ZSTD(1)),
    cost_total_microcents    UInt64   DEFAULT 0                        CODEC(T64, ZSTD(1)),

    -- Whether cost was estimated by Latitude or reported by the provider.
    cost_is_estimated        UInt8    DEFAULT 0                        CODEC(T64, LZ4),

    response_id              String   DEFAULT ''                       CODEC(ZSTD(1)),   -- gen_ai.response.id
    finish_reasons           Array(LowCardinality(String)) DEFAULT []  CODEC(ZSTD(1)),  -- gen_ai.finish_reasons

    -- ═══════════════════════════════════════════════════════
    -- DYNAMIC ATTRIBUTES
    --
    -- Request parameters and any non-standard attributes.
    -- Typed maps avoid schema changes when new attributes appear.
    -- Detail-view only — never filtered or aggregated.
    -- ═══════════════════════════════════════════════════════

    attr_string              Map(LowCardinality(String), String)       CODEC(ZSTD(1)),
    attr_int                 Map(LowCardinality(String), Int64)        CODEC(ZSTD(1)),
    attr_float               Map(LowCardinality(String), Float64)      CODEC(ZSTD(1)),
    attr_bool                Map(LowCardinality(String), UInt8)        CODEC(ZSTD(1)),

    -- OTEL resource attributes (service.name is promoted to its own column).
    resource_string          Map(LowCardinality(String), String)       CODEC(ZSTD(1)),

    scope_name               LowCardinality(String)   DEFAULT ''       CODEC(ZSTD(1)),
    scope_version            LowCardinality(String)   DEFAULT ''       CODEC(ZSTD(1)),

    -- ═══════════════════════════════════════════════════════
    -- LLM CONTENT PAYLOADS
    --
    -- Large, user-generated content. Read only on single-span
    -- detail view. ZSTD(3) for maximum compression on JSON.
    -- ═══════════════════════════════════════════════════════

    input_messages           String   DEFAULT ''                       CODEC(ZSTD(3)),
    output_messages          String   DEFAULT ''                       CODEC(ZSTD(3)),
    system_instructions      String   DEFAULT ''                       CODEC(ZSTD(3)),
    tool_definitions         String   DEFAULT ''                       CODEC(ZSTD(3)),

    -- ═══════════════════════════════════════════════════════
    -- PLATFORM METADATA
    -- ═══════════════════════════════════════════════════════

    -- Server-side ingestion timestamp. Used as the version column
    -- for ReplacingMergeTree: later ingestion wins on deduplication.
    ingested_at              DateTime64(3, 'UTC') DEFAULT now64(3)     CODEC(Delta(8), LZ4),

    -- ═══════════════════════════════════════════════════════
    -- SKIP INDEXES
    -- ═══════════════════════════════════════════════════════

    INDEX idx_trace_id       trace_id     TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_session_id     session_id   TYPE bloom_filter(0.01) GRANULARITY 2,
    INDEX idx_model          model        TYPE bloom_filter(0.01) GRANULARITY 4,
    INDEX idx_provider       provider     TYPE bloom_filter(0.01) GRANULARITY 4,
    INDEX idx_status         status_code  TYPE set(3)             GRANULARITY 1,
    INDEX idx_operation      operation    TYPE bloom_filter(0.01) GRANULARITY 4,
    INDEX idx_error_type     error_type   TYPE bloom_filter(0.01) GRANULARITY 2,
    INDEX idx_service        service_name TYPE bloom_filter(0.01) GRANULARITY 4,
    INDEX idx_tags           tags         TYPE bloom_filter(0.01) GRANULARITY 2
)
ENGINE = ReplacingMergeTree(ingested_at)
PARTITION BY toYYYYMM(start_time)
PRIMARY KEY (organization_id, project_id, start_time)
ORDER BY (
    organization_id,
    project_id,
    start_time,
    session_id,
    trace_id,
    span_id
);

-- +goose Down
DROP TABLE IF EXISTS spans;
-- +goose NO TRANSACTION
-- +goose Up

-- Destination table: stores pre-aggregated trace-level summaries.
-- Populated automatically by the traces_mv materialized view on each
-- insert into spans.  Read queries must re-aggregate with GROUP BY
-- because background merges may not have combined all partial rows yet.
-- SimpleAggregateFunction columns: re-apply the aggregate (sum/min/max).
-- AggregateFunction columns: finalize with -Merge combinators.
CREATE TABLE IF NOT EXISTS traces ON CLUSTER default
(
    -- ═══════════════════════════════════════════════════════
    -- GROUP KEYS
    -- ═══════════════════════════════════════════════════════

    organization_id          LowCardinality(String)                                                    CODEC(ZSTD(1)),
    project_id               LowCardinality(String)                                                    CODEC(ZSTD(1)),
    trace_id                 FixedString(32)                                                           CODEC(ZSTD(1)),

    -- ═══════════════════════════════════════════════════════
    -- SIMPLE AGGREGATES  (plain values, re-aggregate at read)
    -- ═══════════════════════════════════════════════════════

    span_count               SimpleAggregateFunction(sum, UInt64)                                      CODEC(T64, ZSTD(1)),
    error_count              SimpleAggregateFunction(sum, UInt64)                                      CODEC(T64, ZSTD(1)),

    min_start_time           SimpleAggregateFunction(min, DateTime64(9, 'UTC'))                        CODEC(Delta(8), ZSTD(1)),
    max_end_time             SimpleAggregateFunction(max, DateTime64(9, 'UTC'))                        CODEC(Delta(8), ZSTD(1)),

    -- ALIAS: computed at read time from the SimpleAggregateFunction values.
    -- Correct after background merges; use explicit min/max in queries
    -- that GROUP BY to finalize partial rows.
    duration_ns              ALIAS reinterpretAsInt64(max_end_time)
                                 - reinterpretAsInt64(min_start_time),

    -- Worst OTel status across all spans: 0=UNSET 1=OK 2=ERROR
    overall_status           SimpleAggregateFunction(max, Int16)                                       CODEC(T64, ZSTD(1)),

    -- Token counts (UInt64 to avoid overflow when summing UInt32 spans)
    tokens_input             SimpleAggregateFunction(sum, UInt64)                                      CODEC(T64, ZSTD(1)),
    tokens_output            SimpleAggregateFunction(sum, UInt64)                                      CODEC(T64, ZSTD(1)),
    tokens_cache_read        SimpleAggregateFunction(sum, UInt64)                                      CODEC(T64, ZSTD(1)),
    tokens_cache_create      SimpleAggregateFunction(sum, UInt64)                                      CODEC(T64, ZSTD(1)),
    tokens_reasoning         SimpleAggregateFunction(sum, UInt64)                                      CODEC(T64, ZSTD(1)),
    tokens_total             SimpleAggregateFunction(sum, UInt64)                                      CODEC(T64, ZSTD(1)),

    -- Cost in microcents (1 USD = 100,000,000 microcents)
    cost_input_microcents    SimpleAggregateFunction(sum, UInt64)                                      CODEC(T64, ZSTD(1)),
    cost_output_microcents   SimpleAggregateFunction(sum, UInt64)                                      CODEC(T64, ZSTD(1)),
    cost_total_microcents    SimpleAggregateFunction(sum, UInt64)                                      CODEC(T64, ZSTD(1)),

    -- Union of all span tags across the trace
    tags                     SimpleAggregateFunction(groupUniqArrayArray, Array(String))                CODEC(ZSTD(1)),

    -- ═══════════════════════════════════════════════════════
    -- AGGREGATE-STATE COLUMNS  (binary state, -Merge at read)
    -- ═══════════════════════════════════════════════════════

    -- Distinct non-empty values across spans
    models                   AggregateFunction(groupUniqArrayIf, String, UInt8)                        CODEC(ZSTD(1)),
    providers                AggregateFunction(groupUniqArrayIf, String, UInt8)                        CODEC(ZSTD(1)),
    service_names            AggregateFunction(groupUniqArrayIf, String, UInt8)                        CODEC(ZSTD(1)),

    -- Root span = earliest span with no parent
    root_span_id             AggregateFunction(argMinIf, FixedString(16), DateTime64(9, 'UTC'), UInt8) CODEC(ZSTD(1)),
    root_span_name           AggregateFunction(argMinIf, String, DateTime64(9, 'UTC'), UInt8)          CODEC(ZSTD(1)),

    -- First span with input / last span with output
    input_messages           AggregateFunction(argMinIf, String, DateTime64(9, 'UTC'), UInt8)          CODEC(ZSTD(3)),
    output_messages          AggregateFunction(argMaxIf, String, DateTime64(9, 'UTC'), UInt8)          CODEC(ZSTD(3)),

    -- ═══════════════════════════════════════════════════════
    -- SKIP INDEXES
    -- ═══════════════════════════════════════════════════════

    INDEX idx_start_time     min_start_time  TYPE minmax  GRANULARITY 1
)
ENGINE = ReplicatedAggregatingMergeTree
PARTITION BY toYYYYMM(min_start_time)
PRIMARY KEY (organization_id, project_id)
ORDER BY (organization_id, project_id, trace_id)
TTL toDateTime(min_start_time) + INTERVAL 3 MONTH TO VOLUME 'cold'
SETTINGS
    ttl_only_drop_parts = 1,
    storage_policy      = 'tiered';

CREATE MATERIALIZED VIEW IF NOT EXISTS traces_mv ON CLUSTER default TO traces
AS SELECT
    organization_id,
    project_id,
    trace_id,

    -- Simple aggregates (plain values)
    count()                                                         AS span_count,
    countIf(status_code = 2)                                        AS error_count,
    min(start_time)                                                 AS min_start_time,
    max(end_time)                                                   AS max_end_time,
    max(status_code)                                                AS overall_status,

    sum(tokens_input)                                               AS tokens_input,
    sum(tokens_output)                                              AS tokens_output,
    sum(tokens_cache_read)                                          AS tokens_cache_read,
    sum(tokens_cache_create)                                        AS tokens_cache_create,
    sum(tokens_reasoning)                                           AS tokens_reasoning,
    sum(tokens_total)                                               AS tokens_total,

    sum(cost_input_microcents)                                      AS cost_input_microcents,
    sum(cost_output_microcents)                                     AS cost_output_microcents,
    sum(cost_total_microcents)                                      AS cost_total_microcents,

    groupUniqArrayArray(tags)                                       AS tags,

    -- Aggregate-state columns (-State combinators)
    groupUniqArrayIfState(model, model != '')                       AS models,
    groupUniqArrayIfState(provider, provider != '')                 AS providers,
    groupUniqArrayIfState(service_name, service_name != '')         AS service_names,

    argMinIfState(span_id, start_time, parent_span_id = '')         AS root_span_id,
    argMinIfState(name, start_time, parent_span_id = '')            AS root_span_name,
    argMinIfState(input_messages, start_time, input_messages != '')  AS input_messages,
    argMaxIfState(output_messages, end_time, output_messages != '') AS output_messages

FROM spans
GROUP BY organization_id, project_id, trace_id;

-- +goose Down
DROP VIEW IF EXISTS traces_mv ON CLUSTER default;
DROP TABLE IF EXISTS traces ON CLUSTER default;

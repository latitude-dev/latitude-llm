-- +goose NO TRANSACTION
-- +goose Up

CREATE TABLE IF NOT EXISTS sessions
(
    organization_id        LowCardinality(String)                                            CODEC(ZSTD(1)),
    project_id             LowCardinality(String)                                            CODEC(ZSTD(1)),
    session_id             String                                                            CODEC(ZSTD(1)),

    trace_count            AggregateFunction(uniqExact, FixedString(32))                     CODEC(ZSTD(1)),
    trace_ids              AggregateFunction(groupUniqArray, FixedString(32))                CODEC(ZSTD(1)),
    span_count             SimpleAggregateFunction(sum, UInt64)                              CODEC(T64, ZSTD(1)),
    error_count            SimpleAggregateFunction(sum, UInt64)                              CODEC(T64, ZSTD(1)),

    min_start_time         SimpleAggregateFunction(min, DateTime64(9, 'UTC'))                CODEC(Delta(8), ZSTD(1)),
    max_end_time           SimpleAggregateFunction(max, DateTime64(9, 'UTC'))                CODEC(Delta(8), ZSTD(1)),
    duration_ns            Int64 ALIAS reinterpretAsInt64(max_end_time)
                                     - reinterpretAsInt64(min_start_time),

    tokens_input           SimpleAggregateFunction(sum, UInt64)                              CODEC(T64, ZSTD(1)),
    tokens_output          SimpleAggregateFunction(sum, UInt64)                              CODEC(T64, ZSTD(1)),
    tokens_cache_read      SimpleAggregateFunction(sum, UInt64)                              CODEC(T64, ZSTD(1)),
    tokens_cache_create    SimpleAggregateFunction(sum, UInt64)                              CODEC(T64, ZSTD(1)),
    tokens_reasoning       SimpleAggregateFunction(sum, UInt64)                              CODEC(T64, ZSTD(1)),
    tokens_total           SimpleAggregateFunction(sum, UInt64)                              CODEC(T64, ZSTD(1)),

    cost_input_microcents  SimpleAggregateFunction(sum, UInt64)                              CODEC(T64, ZSTD(1)),
    cost_output_microcents SimpleAggregateFunction(sum, UInt64)                              CODEC(T64, ZSTD(1)),
    cost_total_microcents  SimpleAggregateFunction(sum, UInt64)                              CODEC(T64, ZSTD(1)),

    user_id                AggregateFunction(argMaxIf, String, DateTime64(9, 'UTC'), UInt8)  CODEC(ZSTD(1)),
    tags                   SimpleAggregateFunction(groupUniqArrayArray, Array(String))        CODEC(ZSTD(1)),
    metadata               SimpleAggregateFunction(maxMap, Map(String, String))               CODEC(ZSTD(1)),
    models                 AggregateFunction(groupUniqArrayIf, String, UInt8)                 CODEC(ZSTD(1)),
    providers              AggregateFunction(groupUniqArrayIf, String, UInt8)                 CODEC(ZSTD(1)),
    service_names          AggregateFunction(groupUniqArrayIf, String, UInt8)                 CODEC(ZSTD(1)),

    INDEX idx_start_time   min_start_time TYPE minmax GRANULARITY 1
)
ENGINE = AggregatingMergeTree
PARTITION BY toYYYYMM(min_start_time)
PRIMARY KEY (organization_id, project_id)
ORDER BY (organization_id, project_id, session_id);

CREATE MATERIALIZED VIEW IF NOT EXISTS sessions_mv TO sessions
AS SELECT
    s.organization_id,
    s.project_id,
    s.session_id,

    uniqExactState(s.trace_id)                                       AS trace_count,
    groupUniqArrayState(s.trace_id)                                  AS trace_ids,
    count()                                                          AS span_count,
    countIf(s.status_code = 2)                                       AS error_count,

    min(s.start_time)                                                AS min_start_time,
    max(s.end_time)                                                  AS max_end_time,

    sum(s.tokens_input)                                              AS tokens_input,
    sum(s.tokens_output)                                             AS tokens_output,
    sum(s.tokens_cache_read)                                         AS tokens_cache_read,
    sum(s.tokens_cache_create)                                       AS tokens_cache_create,
    sum(s.tokens_reasoning)                                          AS tokens_reasoning,
    sum(s.tokens_total)                                              AS tokens_total,

    sum(s.cost_input_microcents)                                     AS cost_input_microcents,
    sum(s.cost_output_microcents)                                    AS cost_output_microcents,
    sum(s.cost_total_microcents)                                     AS cost_total_microcents,

    argMaxIfState(s.user_id, s.start_time, s.user_id != '')          AS user_id,
    groupUniqArrayArray(s.tags)                                      AS tags,
    maxMap(s.metadata)                                               AS metadata,
    groupUniqArrayIfState(s.model, s.model != '')                    AS models,
    groupUniqArrayIfState(s.provider, s.provider != '')              AS providers,
    groupUniqArrayIfState(s.service_name, s.service_name != '')      AS service_names

FROM spans AS s
WHERE s.session_id != ''
GROUP BY s.organization_id, s.project_id, s.session_id;

-- +goose Down
DROP VIEW IF EXISTS sessions_mv;
DROP TABLE IF EXISTS sessions;

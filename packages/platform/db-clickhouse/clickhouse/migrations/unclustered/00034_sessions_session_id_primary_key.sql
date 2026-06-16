-- +goose NO TRANSACTION
-- +goose Up

-- Promote `session_id` into the PRIMARY KEY of `sessions`.
--
-- The session-detail drawer reads by (organization_id, project_id, session_id),
-- but the PK stopped at (organization_id, project_id) while session_id lived
-- only in the ORDER BY. So the sparse primary index could narrow to the
-- project's range and then had to scan every granule in it to find the session,
-- decompressing the large ZSTD message-payload columns along the way — seconds
-- for a project with history. With session_id in the PK the index seeks
-- straight to the session's granule(s). This matches every other session-keyed
-- table (session_analyses / taxonomy_observations in 00021).
--
-- ClickHouse can't change a populated table's PRIMARY KEY in place, so we
-- rebuild via the create-new + RENAME-swap pattern (see 00013). Columns (incl.
-- `defined_tools` from 00031), partitioning, the minmax index, the plan-aware +
-- sandbox-hard-retention TTLs, and the MV are all carried forward verbatim —
-- only the PRIMARY KEY line changes.

CREATE TABLE IF NOT EXISTS sessions_v2
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
    max_start_time         SimpleAggregateFunction(max, DateTime64(9, 'UTC'))                CODEC(Delta(8), ZSTD(1)),
    duration_ns            SimpleAggregateFunction(sum, Int64) DEFAULT 0                      CODEC(T64, ZSTD(1)),
    time_of_first_token    SimpleAggregateFunction(min, DateTime64(9, 'UTC'))                CODEC(Delta(8), ZSTD(1)),
    time_to_first_token_ns Int64 ALIAS if(time_of_first_token < toDateTime64('2261-01-01', 9, 'UTC'),
                                          reinterpretAsInt64(time_of_first_token) - reinterpretAsInt64(min_start_time),
                                          0),

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
    user_email             AggregateFunction(argMaxIf, String, DateTime64(9, 'UTC'), UInt8)  CODEC(ZSTD(1)),
    tags                   SimpleAggregateFunction(groupUniqArrayArray, Array(String))       CODEC(ZSTD(1)),
    metadata               SimpleAggregateFunction(maxMap, Map(String, String))              CODEC(ZSTD(1)),
    models                 AggregateFunction(groupUniqArrayIf, String, UInt8)                CODEC(ZSTD(1)),
    providers              AggregateFunction(groupUniqArrayIf, String, UInt8)                CODEC(ZSTD(1)),
    service_names          AggregateFunction(groupUniqArrayIf, String, UInt8)                CODEC(ZSTD(1)),
    tools                  AggregateFunction(groupUniqArrayIf, String, UInt8)                CODEC(ZSTD(1)),
    defined_tools          SimpleAggregateFunction(groupUniqArrayArray, Array(String))       CODEC(ZSTD(1)),
    simulation_id          AggregateFunction(argMaxIf, FixedString(24), DateTime64(9, 'UTC'), UInt8) CODEC(ZSTD(1)),
    root_span_id           AggregateFunction(argMinIf, FixedString(16), DateTime64(9, 'UTC'), UInt8) CODEC(ZSTD(1)),
    root_span_name         AggregateFunction(argMinIf, String, DateTime64(9, 'UTC'), UInt8)  CODEC(ZSTD(1)),

    input_messages         AggregateFunction(argMinIf, String, DateTime64(9, 'UTC'), UInt8)  CODEC(ZSTD(3)),
    last_input_messages    AggregateFunction(argMaxIf, String, DateTime64(9, 'UTC'), UInt8)  CODEC(ZSTD(3)),
    output_messages        AggregateFunction(argMaxIf, String, DateTime64(9, 'UTC'), UInt8)  CODEC(ZSTD(3)),
    system_instructions    AggregateFunction(argMinIf, String, DateTime64(9, 'UTC'), UInt8)  CODEC(ZSTD(3)),

    retention_days         SimpleAggregateFunction(max, UInt16) DEFAULT 90                    CODEC(T64, ZSTD(1)),

    INDEX idx_start_time   min_start_time TYPE minmax GRANULARITY 1
)
ENGINE = AggregatingMergeTree
PARTITION BY toYYYYMM(min_start_time)
PRIMARY KEY (organization_id, project_id, session_id)
ORDER BY (organization_id, project_id, session_id)
TTL
    toDateTime(min_start_time) + toIntervalDay(retention_days + 30) DELETE,
    toDateTime(min_start_time) + toIntervalDay(retention_days) DELETE WHERE retention_days < 30;

-- Swap. Drop the MV (materialization pauses for the duration of the DDL below),
-- rename the live table out and the new one in, then recreate the MV against the
-- new live table. Spans inserted during this sub-second window are captured by
-- neither path; everything before it is copied from the frozen legacy table.
DROP VIEW IF EXISTS sessions_mv;
RENAME TABLE sessions TO sessions_legacy;
RENAME TABLE sessions_v2 TO sessions;

CREATE MATERIALIZED VIEW IF NOT EXISTS sessions_mv TO sessions
AS SELECT
    s.organization_id,
    s.project_id,
    coalesce(nullIf(s.session_id, ''), toString(s.trace_id))         AS session_id,
    uniqExactState(s.trace_id)                                       AS trace_count,
    groupUniqArrayState(s.trace_id)                                  AS trace_ids,
    count()                                                          AS span_count,
    countIf(s.status_code = 2)                                       AS error_count,
    min(s.start_time)                                                AS min_start_time,
    max(s.end_time)                                                  AS max_end_time,
    max(s.start_time)                                                AS max_start_time,
    sum(if(((s.parent_span_id = '') OR (s.parent_span_id = '0000000000000000')) AND (s.end_time > s.start_time),
           reinterpretAsInt64(s.end_time) - reinterpretAsInt64(s.start_time),
           toInt64(0)))                                              AS duration_ns,
    min(if(s.time_to_first_token_ns > 0,
           addNanoseconds(s.start_time, toInt64(s.time_to_first_token_ns)),
           toDateTime64('2261-01-01 00:00:00.000000000', 9, 'UTC'))) AS time_of_first_token,
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
    argMaxIfState(s.user_email, s.start_time, s.user_email != '')    AS user_email,
    groupUniqArrayArray(s.tags)                                      AS tags,
    maxMap(s.metadata)                                               AS metadata,
    groupUniqArrayIfState(s.model, s.model != '')                    AS models,
    groupUniqArrayIfState(s.provider, s.provider != '')              AS providers,
    groupUniqArrayIfState(s.service_name, s.service_name != '')      AS service_names,
    groupUniqArrayIfState(s.tool_name, (s.operation = 'execute_tool') AND (s.tool_name != '')) AS tools,
    groupUniqArrayArray(arrayFilter(n -> n != '', s.tool_names))     AS defined_tools,
    argMaxIfState(s.simulation_id, s.start_time, s.simulation_id != '') AS simulation_id,
    argMinIfState(s.span_id, s.start_time, (s.parent_span_id = '') OR (s.parent_span_id = '0000000000000000')) AS root_span_id,
    argMinIfState(s.name, s.start_time, (s.parent_span_id = '') OR (s.parent_span_id = '0000000000000000')) AS root_span_name,
    argMinIfState(s.input_messages, s.start_time, s.input_messages != '') AS input_messages,
    argMaxIfState(s.input_messages, s.end_time, s.output_messages != '') AS last_input_messages,
    argMaxIfState(s.output_messages, s.end_time, s.output_messages != '') AS output_messages,
    argMinIfState(s.system_instructions, s.start_time, s.system_instructions != '') AS system_instructions,
    max(s.retention_days)                                            AS retention_days
FROM spans AS s
GROUP BY
    s.organization_id,
    s.project_id,
    coalesce(nullIf(s.session_id, ''), toString(s.trace_id));

-- Carry historical aggregate states across. Same physical columns on both
-- sides, so `SELECT *` copies the AggregateFunction states verbatim (no span
-- re-aggregation) and AggregatingMergeTree merges them. The ALIAS column
-- (time_to_first_token_ns) is excluded by `*` on both sides.
INSERT INTO sessions SELECT * FROM sessions_legacy;

DROP TABLE IF EXISTS sessions_legacy;

-- +goose Down

CREATE TABLE IF NOT EXISTS sessions_v1
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
    max_start_time         SimpleAggregateFunction(max, DateTime64(9, 'UTC'))                CODEC(Delta(8), ZSTD(1)),
    duration_ns            SimpleAggregateFunction(sum, Int64) DEFAULT 0                      CODEC(T64, ZSTD(1)),
    time_of_first_token    SimpleAggregateFunction(min, DateTime64(9, 'UTC'))                CODEC(Delta(8), ZSTD(1)),
    time_to_first_token_ns Int64 ALIAS if(time_of_first_token < toDateTime64('2261-01-01', 9, 'UTC'),
                                          reinterpretAsInt64(time_of_first_token) - reinterpretAsInt64(min_start_time),
                                          0),

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
    user_email             AggregateFunction(argMaxIf, String, DateTime64(9, 'UTC'), UInt8)  CODEC(ZSTD(1)),
    tags                   SimpleAggregateFunction(groupUniqArrayArray, Array(String))       CODEC(ZSTD(1)),
    metadata               SimpleAggregateFunction(maxMap, Map(String, String))              CODEC(ZSTD(1)),
    models                 AggregateFunction(groupUniqArrayIf, String, UInt8)                CODEC(ZSTD(1)),
    providers              AggregateFunction(groupUniqArrayIf, String, UInt8)                CODEC(ZSTD(1)),
    service_names          AggregateFunction(groupUniqArrayIf, String, UInt8)                CODEC(ZSTD(1)),
    tools                  AggregateFunction(groupUniqArrayIf, String, UInt8)                CODEC(ZSTD(1)),
    defined_tools          SimpleAggregateFunction(groupUniqArrayArray, Array(String))       CODEC(ZSTD(1)),
    simulation_id          AggregateFunction(argMaxIf, FixedString(24), DateTime64(9, 'UTC'), UInt8) CODEC(ZSTD(1)),
    root_span_id           AggregateFunction(argMinIf, FixedString(16), DateTime64(9, 'UTC'), UInt8) CODEC(ZSTD(1)),
    root_span_name         AggregateFunction(argMinIf, String, DateTime64(9, 'UTC'), UInt8)  CODEC(ZSTD(1)),

    input_messages         AggregateFunction(argMinIf, String, DateTime64(9, 'UTC'), UInt8)  CODEC(ZSTD(3)),
    last_input_messages    AggregateFunction(argMaxIf, String, DateTime64(9, 'UTC'), UInt8)  CODEC(ZSTD(3)),
    output_messages        AggregateFunction(argMaxIf, String, DateTime64(9, 'UTC'), UInt8)  CODEC(ZSTD(3)),
    system_instructions    AggregateFunction(argMinIf, String, DateTime64(9, 'UTC'), UInt8)  CODEC(ZSTD(3)),

    retention_days         SimpleAggregateFunction(max, UInt16) DEFAULT 90                    CODEC(T64, ZSTD(1)),

    INDEX idx_start_time   min_start_time TYPE minmax GRANULARITY 1
)
ENGINE = AggregatingMergeTree
PARTITION BY toYYYYMM(min_start_time)
PRIMARY KEY (organization_id, project_id)
ORDER BY (organization_id, project_id, session_id)
TTL
    toDateTime(min_start_time) + toIntervalDay(retention_days + 30) DELETE,
    toDateTime(min_start_time) + toIntervalDay(retention_days) DELETE WHERE retention_days < 30;

DROP VIEW IF EXISTS sessions_mv;
RENAME TABLE sessions TO sessions_legacy;
RENAME TABLE sessions_v1 TO sessions;

CREATE MATERIALIZED VIEW IF NOT EXISTS sessions_mv TO sessions
AS SELECT
    s.organization_id,
    s.project_id,
    coalesce(nullIf(s.session_id, ''), toString(s.trace_id))         AS session_id,
    uniqExactState(s.trace_id)                                       AS trace_count,
    groupUniqArrayState(s.trace_id)                                  AS trace_ids,
    count()                                                          AS span_count,
    countIf(s.status_code = 2)                                       AS error_count,
    min(s.start_time)                                                AS min_start_time,
    max(s.end_time)                                                  AS max_end_time,
    max(s.start_time)                                                AS max_start_time,
    sum(if(((s.parent_span_id = '') OR (s.parent_span_id = '0000000000000000')) AND (s.end_time > s.start_time),
           reinterpretAsInt64(s.end_time) - reinterpretAsInt64(s.start_time),
           toInt64(0)))                                              AS duration_ns,
    min(if(s.time_to_first_token_ns > 0,
           addNanoseconds(s.start_time, toInt64(s.time_to_first_token_ns)),
           toDateTime64('2261-01-01 00:00:00.000000000', 9, 'UTC'))) AS time_of_first_token,
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
    argMaxIfState(s.user_email, s.start_time, s.user_email != '')    AS user_email,
    groupUniqArrayArray(s.tags)                                      AS tags,
    maxMap(s.metadata)                                               AS metadata,
    groupUniqArrayIfState(s.model, s.model != '')                    AS models,
    groupUniqArrayIfState(s.provider, s.provider != '')              AS providers,
    groupUniqArrayIfState(s.service_name, s.service_name != '')      AS service_names,
    groupUniqArrayIfState(s.tool_name, (s.operation = 'execute_tool') AND (s.tool_name != '')) AS tools,
    groupUniqArrayArray(arrayFilter(n -> n != '', s.tool_names))     AS defined_tools,
    argMaxIfState(s.simulation_id, s.start_time, s.simulation_id != '') AS simulation_id,
    argMinIfState(s.span_id, s.start_time, (s.parent_span_id = '') OR (s.parent_span_id = '0000000000000000')) AS root_span_id,
    argMinIfState(s.name, s.start_time, (s.parent_span_id = '') OR (s.parent_span_id = '0000000000000000')) AS root_span_name,
    argMinIfState(s.input_messages, s.start_time, s.input_messages != '') AS input_messages,
    argMaxIfState(s.input_messages, s.end_time, s.output_messages != '') AS last_input_messages,
    argMaxIfState(s.output_messages, s.end_time, s.output_messages != '') AS output_messages,
    argMinIfState(s.system_instructions, s.start_time, s.system_instructions != '') AS system_instructions,
    max(s.retention_days)                                            AS retention_days
FROM spans AS s
GROUP BY
    s.organization_id,
    s.project_id,
    coalesce(nullIf(s.session_id, ''), toString(s.trace_id));

INSERT INTO sessions SELECT * FROM sessions_legacy;

DROP TABLE IF EXISTS sessions_legacy;

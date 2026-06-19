-- +goose NO TRANSACTION
-- +goose Up

-- Promote `trace_id` into the PRIMARY KEY of `traces`.
--
-- The trace/session drawer reads by (organization_id, project_id, trace_id) via
-- findByTraceId — on every drawer open, and again when the conversation tab
-- builds its span maps — but the PK stopped at (organization_id, project_id)
-- while trace_id lived only in the ORDER BY. So the sparse primary index could
-- narrow to the project's range and then had to scan every granule in it to find
-- the trace, decompressing the large ZSTD message-payload columns along the way —
-- seconds for a project with history. With trace_id in the PK the index seeks
-- straight to the trace's granule(s). This mirrors 00034, which did the same for
-- sessions (session_id), and matches every entity-keyed rollup.
--
-- ClickHouse can't change a populated table's PRIMARY KEY in place, so we
-- rebuild via the create-new + RENAME-swap pattern (see 00013 / 00034). Columns
-- (incl. `defined_tools` from 00032), partitioning, the minmax index, the
-- plan-aware + sandbox-hard-retention TTLs (00011 / 00020), and the MV (00032)
-- are all carried forward verbatim — only the PRIMARY KEY line changes.

CREATE TABLE IF NOT EXISTS traces_v2
(
    organization_id          LowCardinality(String)                                                    CODEC(ZSTD(1)),
    project_id               LowCardinality(String)                                                    CODEC(ZSTD(1)),
    trace_id                 FixedString(32)                                                           CODEC(ZSTD(1)),

    span_count               SimpleAggregateFunction(sum, UInt64)                                      CODEC(T64, ZSTD(1)),
    error_count              SimpleAggregateFunction(sum, UInt64)                                      CODEC(T64, ZSTD(1)),

    min_start_time           SimpleAggregateFunction(min, DateTime64(9, 'UTC'))                        CODEC(Delta(8), ZSTD(1)),
    max_end_time             SimpleAggregateFunction(max, DateTime64(9, 'UTC'))                        CODEC(Delta(8), ZSTD(1)),
    time_of_first_token      SimpleAggregateFunction(min, DateTime64(9, 'UTC'))                        CODEC(Delta(8), ZSTD(1)),
    time_to_first_token_ns   Int64 ALIAS if(time_of_first_token < toDateTime64('2261-01-01', 9, 'UTC'),
                                            reinterpretAsInt64(time_of_first_token) - reinterpretAsInt64(min_start_time),
                                            0),
    duration_ns              ALIAS reinterpretAsInt64(max_end_time) - reinterpretAsInt64(min_start_time),

    tokens_input             SimpleAggregateFunction(sum, UInt64)                                      CODEC(T64, ZSTD(1)),
    tokens_output            SimpleAggregateFunction(sum, UInt64)                                      CODEC(T64, ZSTD(1)),
    tokens_cache_read        SimpleAggregateFunction(sum, UInt64)                                      CODEC(T64, ZSTD(1)),
    tokens_cache_create      SimpleAggregateFunction(sum, UInt64)                                      CODEC(T64, ZSTD(1)),
    tokens_reasoning         SimpleAggregateFunction(sum, UInt64)                                      CODEC(T64, ZSTD(1)),
    tokens_total             SimpleAggregateFunction(sum, UInt64)                                      CODEC(T64, ZSTD(1)),

    cost_input_microcents    SimpleAggregateFunction(sum, UInt64)                                      CODEC(T64, ZSTD(1)),
    cost_output_microcents   SimpleAggregateFunction(sum, UInt64)                                      CODEC(T64, ZSTD(1)),
    cost_total_microcents    SimpleAggregateFunction(sum, UInt64)                                      CODEC(T64, ZSTD(1)),

    session_id               AggregateFunction(argMaxIf, String, DateTime64(9, 'UTC'), UInt8)          CODEC(ZSTD(1)),
    user_id                  AggregateFunction(argMaxIf, String, DateTime64(9, 'UTC'), UInt8)          CODEC(ZSTD(1)),
    user_email               AggregateFunction(argMaxIf, String, DateTime64(9, 'UTC'), UInt8)          CODEC(ZSTD(1)),
    tags                     SimpleAggregateFunction(groupUniqArrayArray, Array(String))                CODEC(ZSTD(1)),
    metadata                 SimpleAggregateFunction(maxMap, Map(String, String))                       CODEC(ZSTD(1)),
    simulation_id            AggregateFunction(argMaxIf, FixedString(24), DateTime64(9, 'UTC'), UInt8)  CODEC(ZSTD(1)),
    models                   AggregateFunction(groupUniqArrayIf, String, UInt8)                        CODEC(ZSTD(1)),
    providers                AggregateFunction(groupUniqArrayIf, String, UInt8)                        CODEC(ZSTD(1)),
    service_names            AggregateFunction(groupUniqArrayIf, String, UInt8)                        CODEC(ZSTD(1)),
    tools                    AggregateFunction(groupUniqArrayIf, String, UInt8)                        CODEC(ZSTD(1)),
    defined_tools            SimpleAggregateFunction(groupUniqArrayArray, Array(String))                CODEC(ZSTD(1)),
    root_span_id             AggregateFunction(argMinIf, FixedString(16), DateTime64(9, 'UTC'), UInt8) CODEC(ZSTD(1)),
    root_span_name           AggregateFunction(argMinIf, String, DateTime64(9, 'UTC'), UInt8)          CODEC(ZSTD(1)),

    input_messages           AggregateFunction(argMinIf, String, DateTime64(9, 'UTC'), UInt8)          CODEC(ZSTD(3)),
    last_input_messages      AggregateFunction(argMaxIf, String, DateTime64(9, 'UTC'), UInt8)          CODEC(ZSTD(3)),
    output_messages          AggregateFunction(argMaxIf, String, DateTime64(9, 'UTC'), UInt8)          CODEC(ZSTD(3)),
    system_instructions      AggregateFunction(argMinIf, String, DateTime64(9, 'UTC'), UInt8)          CODEC(ZSTD(3)),

    retention_days           SimpleAggregateFunction(max, UInt16) DEFAULT 90                            CODEC(T64, ZSTD(1)),

    INDEX idx_start_time     min_start_time TYPE minmax GRANULARITY 1
)
ENGINE = AggregatingMergeTree
PARTITION BY toYYYYMM(min_start_time)
PRIMARY KEY (organization_id, project_id, trace_id)
ORDER BY (organization_id, project_id, trace_id)
TTL
    toDateTime(min_start_time) + toIntervalDay(retention_days + 30) DELETE,
    toDateTime(min_start_time) + toIntervalDay(retention_days) DELETE WHERE retention_days < 30;

-- Swap. Drop the MV (materialization pauses for the duration of the DDL below),
-- rename the live table out and the new one in, then recreate the MV against the
-- new live table. Spans inserted during this sub-second window are captured by
-- neither path; everything before it is copied from the frozen legacy table.
DROP VIEW IF EXISTS traces_mv;
RENAME TABLE traces TO traces_legacy;
RENAME TABLE traces_v2 TO traces;

CREATE MATERIALIZED VIEW IF NOT EXISTS traces_mv TO traces
AS SELECT
    organization_id AS organization_id,
    project_id AS project_id,
    trace_id AS trace_id,
    count() AS span_count,
    countIf(status_code = 2) AS error_count,
    min(start_time) AS min_start_time,
    max(end_time) AS max_end_time,
    min(if(time_to_first_token_ns > 0, addNanoseconds(start_time, toInt64(time_to_first_token_ns)), toDateTime64('2261-01-01 00:00:00.000000000', 9, 'UTC'))) AS time_of_first_token,
    sum(tokens_input) AS tokens_input,
    sum(tokens_output) AS tokens_output,
    sum(tokens_cache_read) AS tokens_cache_read,
    sum(tokens_cache_create) AS tokens_cache_create,
    sum(tokens_reasoning) AS tokens_reasoning,
    sum(tokens_total) AS tokens_total,
    sum(cost_input_microcents) AS cost_input_microcents,
    sum(cost_output_microcents) AS cost_output_microcents,
    sum(cost_total_microcents) AS cost_total_microcents,
    argMaxIfState(session_id, start_time, session_id != '') AS session_id,
    argMaxIfState(user_id, start_time, user_id != '') AS user_id,
    argMaxIfState(user_email, start_time, user_email != '') AS user_email,
    groupUniqArrayArray(tags) AS tags,
    maxMap(metadata) AS metadata,
    argMaxIfState(simulation_id, start_time, simulation_id != '') AS simulation_id,
    groupUniqArrayIfState(model, model != '') AS models,
    groupUniqArrayIfState(provider, provider != '') AS providers,
    groupUniqArrayIfState(service_name, service_name != '') AS service_names,
    groupUniqArrayIfState(tool_name, operation = 'execute_tool' AND tool_name != '') AS tools,
    groupUniqArrayArray(arrayFilter(n -> n != '', tool_names)) AS defined_tools,
    argMinIfState(span_id, start_time, parent_span_id = '') AS root_span_id,
    argMinIfState(name, start_time, parent_span_id = '') AS root_span_name,
    argMinIfState(spans.input_messages, start_time, spans.input_messages != '') AS input_messages,
    argMaxIfState(spans.input_messages, end_time, spans.output_messages != '') AS last_input_messages,
    argMaxIfState(spans.output_messages, end_time, spans.output_messages != '') AS output_messages,
    argMinIfState(spans.system_instructions, start_time, spans.system_instructions != '') AS system_instructions,
    max(retention_days) AS retention_days
FROM spans
GROUP BY
    organization_id,
    project_id,
    trace_id;

-- Carry historical aggregate states across. Same physical columns on both
-- sides, so `SELECT *` copies the AggregateFunction states verbatim (no span
-- re-aggregation) and AggregatingMergeTree merges them. The ALIAS columns
-- (duration_ns, time_to_first_token_ns) are excluded by `*` on both sides.
INSERT INTO traces
SELECT *
FROM traces_legacy
SETTINGS
    max_threads = 1,
    max_insert_threads = 1,
    max_streams_to_max_threads_ratio = 1,
    max_block_size = 1024,
    min_insert_block_size_rows = 0,
    min_insert_block_size_bytes = 0;

DROP TABLE IF EXISTS traces_legacy;

-- +goose Down

CREATE TABLE IF NOT EXISTS traces_v1
(
    organization_id          LowCardinality(String)                                                    CODEC(ZSTD(1)),
    project_id               LowCardinality(String)                                                    CODEC(ZSTD(1)),
    trace_id                 FixedString(32)                                                           CODEC(ZSTD(1)),

    span_count               SimpleAggregateFunction(sum, UInt64)                                      CODEC(T64, ZSTD(1)),
    error_count              SimpleAggregateFunction(sum, UInt64)                                      CODEC(T64, ZSTD(1)),

    min_start_time           SimpleAggregateFunction(min, DateTime64(9, 'UTC'))                        CODEC(Delta(8), ZSTD(1)),
    max_end_time             SimpleAggregateFunction(max, DateTime64(9, 'UTC'))                        CODEC(Delta(8), ZSTD(1)),
    time_of_first_token      SimpleAggregateFunction(min, DateTime64(9, 'UTC'))                        CODEC(Delta(8), ZSTD(1)),
    time_to_first_token_ns   Int64 ALIAS if(time_of_first_token < toDateTime64('2261-01-01', 9, 'UTC'),
                                            reinterpretAsInt64(time_of_first_token) - reinterpretAsInt64(min_start_time),
                                            0),
    duration_ns              ALIAS reinterpretAsInt64(max_end_time) - reinterpretAsInt64(min_start_time),

    tokens_input             SimpleAggregateFunction(sum, UInt64)                                      CODEC(T64, ZSTD(1)),
    tokens_output            SimpleAggregateFunction(sum, UInt64)                                      CODEC(T64, ZSTD(1)),
    tokens_cache_read        SimpleAggregateFunction(sum, UInt64)                                      CODEC(T64, ZSTD(1)),
    tokens_cache_create      SimpleAggregateFunction(sum, UInt64)                                      CODEC(T64, ZSTD(1)),
    tokens_reasoning         SimpleAggregateFunction(sum, UInt64)                                      CODEC(T64, ZSTD(1)),
    tokens_total             SimpleAggregateFunction(sum, UInt64)                                      CODEC(T64, ZSTD(1)),

    cost_input_microcents    SimpleAggregateFunction(sum, UInt64)                                      CODEC(T64, ZSTD(1)),
    cost_output_microcents   SimpleAggregateFunction(sum, UInt64)                                      CODEC(T64, ZSTD(1)),
    cost_total_microcents    SimpleAggregateFunction(sum, UInt64)                                      CODEC(T64, ZSTD(1)),

    session_id               AggregateFunction(argMaxIf, String, DateTime64(9, 'UTC'), UInt8)          CODEC(ZSTD(1)),
    user_id                  AggregateFunction(argMaxIf, String, DateTime64(9, 'UTC'), UInt8)          CODEC(ZSTD(1)),
    user_email               AggregateFunction(argMaxIf, String, DateTime64(9, 'UTC'), UInt8)          CODEC(ZSTD(1)),
    tags                     SimpleAggregateFunction(groupUniqArrayArray, Array(String))                CODEC(ZSTD(1)),
    metadata                 SimpleAggregateFunction(maxMap, Map(String, String))                       CODEC(ZSTD(1)),
    simulation_id            AggregateFunction(argMaxIf, FixedString(24), DateTime64(9, 'UTC'), UInt8)  CODEC(ZSTD(1)),
    models                   AggregateFunction(groupUniqArrayIf, String, UInt8)                        CODEC(ZSTD(1)),
    providers                AggregateFunction(groupUniqArrayIf, String, UInt8)                        CODEC(ZSTD(1)),
    service_names            AggregateFunction(groupUniqArrayIf, String, UInt8)                        CODEC(ZSTD(1)),
    tools                    AggregateFunction(groupUniqArrayIf, String, UInt8)                        CODEC(ZSTD(1)),
    defined_tools            SimpleAggregateFunction(groupUniqArrayArray, Array(String))                CODEC(ZSTD(1)),
    root_span_id             AggregateFunction(argMinIf, FixedString(16), DateTime64(9, 'UTC'), UInt8) CODEC(ZSTD(1)),
    root_span_name           AggregateFunction(argMinIf, String, DateTime64(9, 'UTC'), UInt8)          CODEC(ZSTD(1)),

    input_messages           AggregateFunction(argMinIf, String, DateTime64(9, 'UTC'), UInt8)          CODEC(ZSTD(3)),
    last_input_messages      AggregateFunction(argMaxIf, String, DateTime64(9, 'UTC'), UInt8)          CODEC(ZSTD(3)),
    output_messages          AggregateFunction(argMaxIf, String, DateTime64(9, 'UTC'), UInt8)          CODEC(ZSTD(3)),
    system_instructions      AggregateFunction(argMinIf, String, DateTime64(9, 'UTC'), UInt8)          CODEC(ZSTD(3)),

    retention_days           SimpleAggregateFunction(max, UInt16) DEFAULT 90                            CODEC(T64, ZSTD(1)),

    INDEX idx_start_time     min_start_time TYPE minmax GRANULARITY 1
)
ENGINE = AggregatingMergeTree
PARTITION BY toYYYYMM(min_start_time)
PRIMARY KEY (organization_id, project_id)
ORDER BY (organization_id, project_id, trace_id)
TTL
    toDateTime(min_start_time) + toIntervalDay(retention_days + 30) DELETE,
    toDateTime(min_start_time) + toIntervalDay(retention_days) DELETE WHERE retention_days < 30;

DROP VIEW IF EXISTS traces_mv;
RENAME TABLE traces TO traces_legacy;
RENAME TABLE traces_v1 TO traces;

CREATE MATERIALIZED VIEW IF NOT EXISTS traces_mv TO traces
AS SELECT
    organization_id AS organization_id,
    project_id AS project_id,
    trace_id AS trace_id,
    count() AS span_count,
    countIf(status_code = 2) AS error_count,
    min(start_time) AS min_start_time,
    max(end_time) AS max_end_time,
    min(if(time_to_first_token_ns > 0, addNanoseconds(start_time, toInt64(time_to_first_token_ns)), toDateTime64('2261-01-01 00:00:00.000000000', 9, 'UTC'))) AS time_of_first_token,
    sum(tokens_input) AS tokens_input,
    sum(tokens_output) AS tokens_output,
    sum(tokens_cache_read) AS tokens_cache_read,
    sum(tokens_cache_create) AS tokens_cache_create,
    sum(tokens_reasoning) AS tokens_reasoning,
    sum(tokens_total) AS tokens_total,
    sum(cost_input_microcents) AS cost_input_microcents,
    sum(cost_output_microcents) AS cost_output_microcents,
    sum(cost_total_microcents) AS cost_total_microcents,
    argMaxIfState(session_id, start_time, session_id != '') AS session_id,
    argMaxIfState(user_id, start_time, user_id != '') AS user_id,
    argMaxIfState(user_email, start_time, user_email != '') AS user_email,
    groupUniqArrayArray(tags) AS tags,
    maxMap(metadata) AS metadata,
    argMaxIfState(simulation_id, start_time, simulation_id != '') AS simulation_id,
    groupUniqArrayIfState(model, model != '') AS models,
    groupUniqArrayIfState(provider, provider != '') AS providers,
    groupUniqArrayIfState(service_name, service_name != '') AS service_names,
    groupUniqArrayIfState(tool_name, operation = 'execute_tool' AND tool_name != '') AS tools,
    groupUniqArrayArray(arrayFilter(n -> n != '', tool_names)) AS defined_tools,
    argMinIfState(span_id, start_time, parent_span_id = '') AS root_span_id,
    argMinIfState(name, start_time, parent_span_id = '') AS root_span_name,
    argMinIfState(spans.input_messages, start_time, spans.input_messages != '') AS input_messages,
    argMaxIfState(spans.input_messages, end_time, spans.output_messages != '') AS last_input_messages,
    argMaxIfState(spans.output_messages, end_time, spans.output_messages != '') AS output_messages,
    argMinIfState(spans.system_instructions, start_time, spans.system_instructions != '') AS system_instructions,
    max(retention_days) AS retention_days
FROM spans
GROUP BY
    organization_id,
    project_id,
    trace_id;

INSERT INTO traces
SELECT *
FROM traces_legacy
SETTINGS
    max_threads = 1,
    max_insert_threads = 1,
    max_streams_to_max_threads_ratio = 1,
    max_block_size = 1024,
    min_insert_block_size_rows = 0,
    min_insert_block_size_bytes = 0;

DROP TABLE IF EXISTS traces_legacy;

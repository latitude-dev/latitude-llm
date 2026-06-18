-- +goose NO TRANSACTION
-- +goose Up

-- Promote `trace_id` into the PRIMARY KEY of `traces` — clustered variant.
-- See unclustered/00037_traces_trace_id_primary_key.sql for the rationale.
--
-- The trace/session drawer reads by (organization_id, project_id, trace_id) via
-- findByTraceId, but the PK stopped at (organization_id, project_id) while
-- trace_id lived only in the ORDER BY, so a point read scanned every granule in
-- the project range (decompressing the large ZSTD message columns) instead of
-- seeking to the trace's granule(s). ClickHouse can't change a populated table's
-- PRIMARY KEY in place, so we rebuild via the create-new + RENAME-swap pattern
-- (00013 / 00034). Columns (incl. `defined_tools` from 00032), partitioning, the
-- minmax index, the plan-aware + sandbox-hard-retention TTLs, and the MV are
-- carried forward verbatim — only the PRIMARY KEY line changes.

CREATE TABLE IF NOT EXISTS traces_v2 ON CLUSTER default
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
ENGINE = ReplicatedAggregatingMergeTree
PARTITION BY toYYYYMM(min_start_time)
PRIMARY KEY (organization_id, project_id, trace_id)
ORDER BY (organization_id, project_id, trace_id)
TTL
    toDateTime(min_start_time) + toIntervalDay(retention_days + 30) DELETE,
    toDateTime(min_start_time) + toIntervalDay(retention_days) DELETE WHERE retention_days < 30;

-- Swap. Separate RENAME statements (not one atomic multi-rename): ClickHouse
-- Cloud Shared databases reject multi-table RENAME (see 00013 / 00034).
DROP VIEW IF EXISTS traces_mv ON CLUSTER default;
RENAME TABLE traces TO traces_legacy ON CLUSTER default;
RENAME TABLE traces_v2 TO traces ON CLUSTER default;

CREATE MATERIALIZED VIEW IF NOT EXISTS traces_mv ON CLUSTER default TO traces
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

-- Backfill historical aggregate states from the frozen legacy table. Same
-- physical columns on both sides, so `SELECT *` copies the AggregateFunction
-- states verbatim (no span re-aggregation). INSERT...SELECT carries no ON
-- CLUSTER: it runs on the node the migration runner connects to, and the
-- Replicated* target propagates the inserted parts to the other replicas
-- (single shard — same pattern as 00027 / 00034). The ALIAS columns
-- (duration_ns, time_to_first_token_ns) are excluded by `*` on both sides.
INSERT INTO traces SELECT * FROM traces_legacy;

DROP TABLE IF EXISTS traces_legacy ON CLUSTER default;

-- +goose Down

CREATE TABLE IF NOT EXISTS traces_v1 ON CLUSTER default
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
ENGINE = ReplicatedAggregatingMergeTree
PARTITION BY toYYYYMM(min_start_time)
PRIMARY KEY (organization_id, project_id)
ORDER BY (organization_id, project_id, trace_id)
TTL
    toDateTime(min_start_time) + toIntervalDay(retention_days + 30) DELETE,
    toDateTime(min_start_time) + toIntervalDay(retention_days) DELETE WHERE retention_days < 30;

DROP VIEW IF EXISTS traces_mv ON CLUSTER default;
RENAME TABLE traces TO traces_legacy ON CLUSTER default;
RENAME TABLE traces_v1 TO traces ON CLUSTER default;

CREATE MATERIALIZED VIEW IF NOT EXISTS traces_mv ON CLUSTER default TO traces
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

INSERT INTO traces SELECT * FROM traces_legacy;

DROP TABLE IF EXISTS traces_legacy ON CLUSTER default;

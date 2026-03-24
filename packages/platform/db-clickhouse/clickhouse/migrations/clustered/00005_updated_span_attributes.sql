-- +goose NO TRANSACTION
-- +goose Up

ALTER TABLE spans ON CLUSTER default
    ADD COLUMN IF NOT EXISTS time_to_first_token_ns UInt64 DEFAULT 0 CODEC(T64, ZSTD(1)) AFTER cost_is_estimated,
    ADD COLUMN IF NOT EXISTS is_streaming UInt8 DEFAULT 0 CODEC(T64, LZ4) AFTER time_to_first_token_ns,
    ADD COLUMN IF NOT EXISTS tool_call_id LowCardinality(String) DEFAULT '' CODEC(ZSTD(1)) AFTER tool_definitions,
    ADD COLUMN IF NOT EXISTS tool_name LowCardinality(String) DEFAULT '' CODEC(ZSTD(1)) AFTER tool_call_id,
    ADD COLUMN IF NOT EXISTS tool_input String DEFAULT '' CODEC(ZSTD(3)) AFTER tool_name,
    ADD COLUMN IF NOT EXISTS tool_output String DEFAULT '' CODEC(ZSTD(3)) AFTER tool_input;

ALTER TABLE spans ON CLUSTER default
    ADD COLUMN IF NOT EXISTS tokens_per_second Float64 ALIAS if(duration_ns > 0 AND tokens_output > 0, tokens_output * 1000000000.0 / duration_ns, 0) AFTER is_streaming,
    ADD COLUMN IF NOT EXISTS inter_token_latency_ns Float64 ALIAS if(tokens_output > 1 AND duration_ns > 0, toFloat64(if(time_to_first_token_ns > 0, duration_ns - time_to_first_token_ns, duration_ns)) / (tokens_output - 1), 0) AFTER tokens_per_second;

-- ═══════════════════════════════════════════════════════════
-- Traces table: remove overall_status, add TTFT columns
-- ═══════════════════════════════════════════════════════════

DROP VIEW IF EXISTS traces_mv ON CLUSTER default;

ALTER TABLE traces ON CLUSTER default DROP COLUMN IF EXISTS overall_status;

ALTER TABLE traces ON CLUSTER default
    ADD COLUMN IF NOT EXISTS time_of_first_token SimpleAggregateFunction(min, DateTime64(9, 'UTC')) CODEC(Delta(8), ZSTD(1)) AFTER max_end_time;

ALTER TABLE traces ON CLUSTER default
    ADD COLUMN IF NOT EXISTS time_to_first_token_ns Int64 ALIAS if(
        time_of_first_token < toDateTime64('2261-01-01', 9, 'UTC'),
        reinterpretAsInt64(time_of_first_token) - reinterpretAsInt64(min_start_time),
        0
    ) AFTER time_of_first_token;

CREATE MATERIALIZED VIEW IF NOT EXISTS traces_mv ON CLUSTER default TO traces
AS SELECT
    organization_id,
    project_id,
    trace_id,

    count()                                                         AS span_count,
    countIf(status_code = 2)                                        AS error_count,
    min(start_time)                                                 AS min_start_time,
    max(end_time)                                                   AS max_end_time,

    min(if(
        time_to_first_token_ns > 0,
        addNanoseconds(start_time, toInt64(time_to_first_token_ns)),
        toDateTime64('2261-01-01 00:00:00.000000000', 9, 'UTC')
    ))                                                              AS time_of_first_token,

    sum(tokens_input)                                               AS tokens_input,
    sum(tokens_output)                                              AS tokens_output,
    sum(tokens_cache_read)                                          AS tokens_cache_read,
    sum(tokens_cache_create)                                        AS tokens_cache_create,
    sum(tokens_reasoning)                                           AS tokens_reasoning,
    sum(tokens_total)                                               AS tokens_total,

    sum(cost_input_microcents)                                      AS cost_input_microcents,
    sum(cost_output_microcents)                                     AS cost_output_microcents,
    sum(cost_total_microcents)                                      AS cost_total_microcents,

    argMaxIfState(session_id, start_time, session_id != '')          AS session_id,
    argMaxIfState(user_id, start_time, user_id != '')                AS user_id,
    groupUniqArrayArray(tags)                                       AS tags,
    maxMap(metadata)                                                 AS metadata,

    groupUniqArrayIfState(model, model != '')                       AS models,
    groupUniqArrayIfState(provider, provider != '')                 AS providers,
    groupUniqArrayIfState(service_name, service_name != '')         AS service_names,

    argMinIfState(span_id, start_time, parent_span_id = '')         AS root_span_id,
    argMinIfState(name, start_time, parent_span_id = '')            AS root_span_name,
    argMinIfState(spans.input_messages, start_time, spans.input_messages != '')  AS input_messages,
    argMaxIfState(spans.input_messages, end_time, spans.output_messages != '')  AS last_input_messages,
    argMaxIfState(spans.output_messages, end_time, spans.output_messages != '') AS output_messages,
    argMinIfState(spans.system_instructions, start_time, spans.system_instructions != '') AS system_instructions

FROM spans
GROUP BY organization_id, project_id, trace_id;

-- +goose Down

-- Restore traces MV with overall_status
DROP VIEW IF EXISTS traces_mv ON CLUSTER default;

ALTER TABLE traces ON CLUSTER default DROP COLUMN IF EXISTS time_to_first_token_ns;
ALTER TABLE traces ON CLUSTER default DROP COLUMN IF EXISTS time_of_first_token;

ALTER TABLE traces ON CLUSTER default
    ADD COLUMN IF NOT EXISTS overall_status SimpleAggregateFunction(max, Int16) CODEC(T64, ZSTD(1)) AFTER max_end_time;

CREATE MATERIALIZED VIEW IF NOT EXISTS traces_mv ON CLUSTER default TO traces
AS SELECT
    organization_id,
    project_id,
    trace_id,

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

    argMaxIfState(session_id, start_time, session_id != '')          AS session_id,
    argMaxIfState(user_id, start_time, user_id != '')                AS user_id,
    groupUniqArrayArray(tags)                                       AS tags,
    maxMap(metadata)                                                 AS metadata,

    groupUniqArrayIfState(model, model != '')                       AS models,
    groupUniqArrayIfState(provider, provider != '')                 AS providers,
    groupUniqArrayIfState(service_name, service_name != '')         AS service_names,

    argMinIfState(span_id, start_time, parent_span_id = '')         AS root_span_id,
    argMinIfState(name, start_time, parent_span_id = '')            AS root_span_name,
    argMinIfState(spans.input_messages, start_time, spans.input_messages != '')  AS input_messages,
    argMaxIfState(spans.input_messages, end_time, spans.output_messages != '')  AS last_input_messages,
    argMaxIfState(spans.output_messages, end_time, spans.output_messages != '') AS output_messages,
    argMinIfState(spans.system_instructions, start_time, spans.system_instructions != '') AS system_instructions

FROM spans
GROUP BY organization_id, project_id, trace_id;

-- Revert span columns
ALTER TABLE spans ON CLUSTER default DROP COLUMN IF EXISTS inter_token_latency_ns;
ALTER TABLE spans ON CLUSTER default DROP COLUMN IF EXISTS tokens_per_second;
ALTER TABLE spans ON CLUSTER default DROP COLUMN IF EXISTS tool_output;
ALTER TABLE spans ON CLUSTER default DROP COLUMN IF EXISTS tool_input;
ALTER TABLE spans ON CLUSTER default DROP COLUMN IF EXISTS tool_name;
ALTER TABLE spans ON CLUSTER default DROP COLUMN IF EXISTS tool_call_id;
ALTER TABLE spans ON CLUSTER default DROP COLUMN IF EXISTS is_streaming;
ALTER TABLE spans ON CLUSTER default DROP COLUMN IF EXISTS time_to_first_token_ns;

-- +goose NO TRANSACTION
-- +goose Up

-- Persist called tools on the traces rollup — clustered variant.
-- See unclustered/00026_persist_tools_in_traces.sql for full notes.

ALTER TABLE traces ON CLUSTER default
    ADD COLUMN IF NOT EXISTS tools
        AggregateFunction(groupUniqArrayIf, String, UInt8) CODEC(ZSTD(1)) AFTER service_names;

DROP VIEW IF EXISTS traces_mv ON CLUSTER default;

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
    groupUniqArrayArray(tags) AS tags,
    maxMap(metadata) AS metadata,
    argMaxIfState(simulation_id, start_time, simulation_id != '') AS simulation_id,
    groupUniqArrayIfState(model, model != '') AS models,
    groupUniqArrayIfState(provider, provider != '') AS providers,
    groupUniqArrayIfState(service_name, service_name != '') AS service_names,
    groupUniqArrayIfState(tool_name, operation = 'execute_tool' AND tool_name != '') AS tools,
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

-- +goose Down

-- Mirrors the Up: drop the view first (it references `tools`), drop the
-- column, then restore the previous view definition.

DROP VIEW IF EXISTS traces_mv ON CLUSTER default;

ALTER TABLE traces ON CLUSTER default
    DROP COLUMN IF EXISTS tools;

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
    groupUniqArrayArray(tags) AS tags,
    maxMap(metadata) AS metadata,
    argMaxIfState(simulation_id, start_time, simulation_id != '') AS simulation_id,
    groupUniqArrayIfState(model, model != '') AS models,
    groupUniqArrayIfState(provider, provider != '') AS providers,
    groupUniqArrayIfState(service_name, service_name != '') AS service_names,
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

-- +goose NO TRANSACTION
-- +goose Up

-- Persist the distinct agent names on the traces rollup — unclustered variant.
-- Body restates the current traces_mv (00043) with `agent_names` added after
-- `service_names`; copy it verbatim so the other rollups are preserved.

ALTER TABLE traces
    ADD COLUMN IF NOT EXISTS agent_names
        AggregateFunction(groupUniqArrayIf, String, UInt8) CODEC(ZSTD(1)) AFTER service_names;

DROP VIEW IF EXISTS traces_mv;

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
    sumIf(tokens_input, operation IN ('chat', 'text_completion', 'generate_content', 'embeddings', 'reranker')) AS tokens_input,
    sumIf(tokens_output, operation IN ('chat', 'text_completion', 'generate_content', 'embeddings', 'reranker')) AS tokens_output,
    sumIf(tokens_cache_read, operation IN ('chat', 'text_completion', 'generate_content', 'embeddings', 'reranker')) AS tokens_cache_read,
    sumIf(tokens_cache_create, operation IN ('chat', 'text_completion', 'generate_content', 'embeddings', 'reranker')) AS tokens_cache_create,
    sumIf(tokens_reasoning, operation IN ('chat', 'text_completion', 'generate_content', 'embeddings', 'reranker')) AS tokens_reasoning,
    sumIf(tokens_total, operation IN ('chat', 'text_completion', 'generate_content', 'embeddings', 'reranker')) AS tokens_total,
    sumIf(cost_input_microcents, operation IN ('chat', 'text_completion', 'generate_content', 'embeddings', 'reranker')) AS cost_input_microcents,
    sumIf(cost_output_microcents, operation IN ('chat', 'text_completion', 'generate_content', 'embeddings', 'reranker')) AS cost_output_microcents,
    sumIf(cost_total_microcents, operation IN ('chat', 'text_completion', 'generate_content', 'embeddings', 'reranker')) AS cost_total_microcents,
    argMaxIfState(session_id, start_time, session_id != '') AS session_id,
    argMaxIfState(user_id, start_time, user_id != '') AS user_id,
    argMaxIfState(user_email, start_time, user_email != '') AS user_email,
    groupUniqArrayArray(tags) AS tags,
    maxMap(metadata) AS metadata,
    argMaxIfState(simulation_id, start_time, simulation_id != '') AS simulation_id,
    groupUniqArrayIfState(model, model != '') AS models,
    groupUniqArrayIfState(provider, provider != '') AS providers,
    groupUniqArrayIfState(service_name, service_name != '') AS service_names,
    groupUniqArrayIfState(agent_name, agent_name != '') AS agent_names,
    groupUniqArrayIfState(tool_name, operation = 'execute_tool' AND tool_name != '') AS tools,
    groupUniqArrayArray(arrayFilter(n -> n != '', tool_names)) AS defined_tools,
    argMinIfState(span_id, start_time, parent_span_id = '') AS root_span_id,
    argMinIfState(name, start_time, parent_span_id = '') AS root_span_name,
    argMinIfState(spans.input_messages, start_time, spans.input_messages != '' AND operation IN ('chat', 'text_completion', 'generate_content')) AS input_messages,
    argMaxIfState(spans.input_messages, end_time, spans.output_messages != '' AND operation IN ('chat', 'text_completion', 'generate_content')) AS last_input_messages,
    argMaxIfState(spans.output_messages, end_time, spans.output_messages != '' AND operation IN ('chat', 'text_completion', 'generate_content')) AS output_messages,
    argMinIfState(spans.system_instructions, start_time, spans.system_instructions != '' AND operation IN ('chat', 'text_completion', 'generate_content', 'invoke_agent')) AS system_instructions,
    max(retention_days) AS retention_days
FROM spans
GROUP BY
    organization_id,
    project_id,
    trace_id;

-- +goose Down

-- Restore the 00043 traces_mv (no agent_names) and drop the column.

DROP VIEW IF EXISTS traces_mv;

ALTER TABLE traces
    DROP COLUMN IF EXISTS agent_names;

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
    sumIf(tokens_input, operation IN ('chat', 'text_completion', 'generate_content', 'embeddings', 'reranker')) AS tokens_input,
    sumIf(tokens_output, operation IN ('chat', 'text_completion', 'generate_content', 'embeddings', 'reranker')) AS tokens_output,
    sumIf(tokens_cache_read, operation IN ('chat', 'text_completion', 'generate_content', 'embeddings', 'reranker')) AS tokens_cache_read,
    sumIf(tokens_cache_create, operation IN ('chat', 'text_completion', 'generate_content', 'embeddings', 'reranker')) AS tokens_cache_create,
    sumIf(tokens_reasoning, operation IN ('chat', 'text_completion', 'generate_content', 'embeddings', 'reranker')) AS tokens_reasoning,
    sumIf(tokens_total, operation IN ('chat', 'text_completion', 'generate_content', 'embeddings', 'reranker')) AS tokens_total,
    sumIf(cost_input_microcents, operation IN ('chat', 'text_completion', 'generate_content', 'embeddings', 'reranker')) AS cost_input_microcents,
    sumIf(cost_output_microcents, operation IN ('chat', 'text_completion', 'generate_content', 'embeddings', 'reranker')) AS cost_output_microcents,
    sumIf(cost_total_microcents, operation IN ('chat', 'text_completion', 'generate_content', 'embeddings', 'reranker')) AS cost_total_microcents,
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
    argMinIfState(spans.input_messages, start_time, spans.input_messages != '' AND operation IN ('chat', 'text_completion', 'generate_content')) AS input_messages,
    argMaxIfState(spans.input_messages, end_time, spans.output_messages != '' AND operation IN ('chat', 'text_completion', 'generate_content')) AS last_input_messages,
    argMaxIfState(spans.output_messages, end_time, spans.output_messages != '' AND operation IN ('chat', 'text_completion', 'generate_content')) AS output_messages,
    argMinIfState(spans.system_instructions, start_time, spans.system_instructions != '' AND operation IN ('chat', 'text_completion', 'generate_content', 'invoke_agent')) AS system_instructions,
    max(retention_days) AS retention_days
FROM spans
GROUP BY
    organization_id,
    project_id,
    trace_id;

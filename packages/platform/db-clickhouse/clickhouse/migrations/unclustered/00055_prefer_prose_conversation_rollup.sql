-- +goose NO TRANSACTION
-- +goose Up

-- Prefer user-facing prose replies over post-turn JSON-array sidecar chats
-- (memory / fact extractors) when rolling up the "latest responsive" conversation.
--
-- 00040 gated conversation to model-call leaves so Vercel `invoke_agent`
-- wrappers no longer steal the rollup. A later leaf `chat` that emits only a
-- JSON array as its text part (`"content":"[]"` / `"content":"[{…}]"`) still
-- wins plain `argMaxIf(..., end_time, …)` because it ends after the real reply.
-- Evaluations, the session drawer, and getTrace then show the extractor turn —
-- burying the recommendation inside a synthetic user blob with assistant `[]`.
--
-- Fix: keep the AggregateFunction signature (`argMaxIf(String, DateTime64, UInt8)`)
-- and demote JSON-array outputs by collapsing their ranking time to epoch so any
-- prior prose leaf wins. Extract-only traces still surface the extractor (all
-- candidates share epoch). Redefines both MVs only — column types unchanged,
-- existing aggregate states stay valid (new-data-only for the MV path; the
-- span-sourced getTrace query is updated in application SQL separately).

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
    argMaxIfState(spans.input_messages, if(match(spans.output_messages, '"content":"\\[(\\]|\\{|\\\\)'), toDateTime64('1970-01-01 00:00:00.000000000', 9, 'UTC'), end_time), spans.output_messages != '' AND operation IN ('chat', 'text_completion', 'generate_content')) AS last_input_messages,
    argMaxIfState(spans.output_messages, if(match(spans.output_messages, '"content":"\\[(\\]|\\{|\\\\)'), toDateTime64('1970-01-01 00:00:00.000000000', 9, 'UTC'), end_time), spans.output_messages != '' AND operation IN ('chat', 'text_completion', 'generate_content')) AS output_messages,
    argMinIfState(spans.system_instructions, start_time, spans.system_instructions != '' AND operation IN ('chat', 'text_completion', 'generate_content', 'invoke_agent')) AS system_instructions,
    max(retention_days) AS retention_days
FROM spans
GROUP BY
    organization_id,
    project_id,
    trace_id;

DROP VIEW IF EXISTS sessions_mv;

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
    sumIf(s.tokens_input, s.operation IN ('chat', 'text_completion', 'generate_content', 'embeddings', 'reranker'))         AS tokens_input,
    sumIf(s.tokens_output, s.operation IN ('chat', 'text_completion', 'generate_content', 'embeddings', 'reranker'))        AS tokens_output,
    sumIf(s.tokens_cache_read, s.operation IN ('chat', 'text_completion', 'generate_content', 'embeddings', 'reranker'))    AS tokens_cache_read,
    sumIf(s.tokens_cache_create, s.operation IN ('chat', 'text_completion', 'generate_content', 'embeddings', 'reranker'))  AS tokens_cache_create,
    sumIf(s.tokens_reasoning, s.operation IN ('chat', 'text_completion', 'generate_content', 'embeddings', 'reranker'))     AS tokens_reasoning,
    sumIf(s.tokens_total, s.operation IN ('chat', 'text_completion', 'generate_content', 'embeddings', 'reranker'))         AS tokens_total,
    sumIf(s.cost_input_microcents, s.operation IN ('chat', 'text_completion', 'generate_content', 'embeddings', 'reranker'))  AS cost_input_microcents,
    sumIf(s.cost_output_microcents, s.operation IN ('chat', 'text_completion', 'generate_content', 'embeddings', 'reranker')) AS cost_output_microcents,
    sumIf(s.cost_total_microcents, s.operation IN ('chat', 'text_completion', 'generate_content', 'embeddings', 'reranker'))  AS cost_total_microcents,
    argMaxIfState(s.user_id, s.start_time, s.user_id != '')          AS user_id,
    argMaxIfState(s.user_email, s.start_time, s.user_email != '')    AS user_email,
    groupUniqArrayArray(s.tags)                                      AS tags,
    maxMap(s.metadata)                                               AS metadata,
    groupUniqArrayIfState(s.model, s.model != '')                    AS models,
    groupUniqArrayIfState(s.provider, s.provider != '')              AS providers,
    groupUniqArrayIfState(s.service_name, s.service_name != '')      AS service_names,
    groupUniqArrayIfState(s.agent_name, s.agent_name != '')          AS agent_names,
    groupUniqArrayIfState(s.tool_name, (s.operation = 'execute_tool') AND (s.tool_name != '')) AS tools,
    groupUniqArrayArray(arrayFilter(n -> n != '', s.tool_names))     AS defined_tools,
    argMaxIfState(s.simulation_id, s.start_time, s.simulation_id != '') AS simulation_id,
    argMinIfState(s.span_id, s.start_time, (s.parent_span_id = '') OR (s.parent_span_id = '0000000000000000')) AS root_span_id,
    argMinIfState(s.name, s.start_time, (s.parent_span_id = '') OR (s.parent_span_id = '0000000000000000')) AS root_span_name,
    argMinIfState(s.input_messages, s.start_time, s.input_messages != '' AND s.operation IN ('chat', 'text_completion', 'generate_content')) AS input_messages,
    argMaxIfState(s.input_messages, if(match(s.output_messages, '"content":"\\[(\\]|\\{|\\\\)'), toDateTime64('1970-01-01 00:00:00.000000000', 9, 'UTC'), s.end_time), s.output_messages != '' AND s.operation IN ('chat', 'text_completion', 'generate_content')) AS last_input_messages,
    argMaxIfState(s.output_messages, if(match(s.output_messages, '"content":"\\[(\\]|\\{|\\\\)'), toDateTime64('1970-01-01 00:00:00.000000000', 9, 'UTC'), s.end_time), s.output_messages != '' AND s.operation IN ('chat', 'text_completion', 'generate_content')) AS output_messages,
    argMinIfState(s.system_instructions, s.start_time, s.system_instructions != '' AND s.operation IN ('chat', 'text_completion', 'generate_content', 'invoke_agent')) AS system_instructions,
    max(s.retention_days)                                            AS retention_days
FROM spans AS s
GROUP BY
    s.organization_id,
    s.project_id,
    coalesce(nullIf(s.session_id, ''), toString(s.trace_id));

-- +goose Down

-- Restore the 00049 traces_mv / 00048 sessions_mv definitions (end_time ranking).

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

DROP VIEW IF EXISTS sessions_mv;

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
    sumIf(s.tokens_input, s.operation IN ('chat', 'text_completion', 'generate_content', 'embeddings', 'reranker'))         AS tokens_input,
    sumIf(s.tokens_output, s.operation IN ('chat', 'text_completion', 'generate_content', 'embeddings', 'reranker'))        AS tokens_output,
    sumIf(s.tokens_cache_read, s.operation IN ('chat', 'text_completion', 'generate_content', 'embeddings', 'reranker'))    AS tokens_cache_read,
    sumIf(s.tokens_cache_create, s.operation IN ('chat', 'text_completion', 'generate_content', 'embeddings', 'reranker'))  AS tokens_cache_create,
    sumIf(s.tokens_reasoning, s.operation IN ('chat', 'text_completion', 'generate_content', 'embeddings', 'reranker'))     AS tokens_reasoning,
    sumIf(s.tokens_total, s.operation IN ('chat', 'text_completion', 'generate_content', 'embeddings', 'reranker'))         AS tokens_total,
    sumIf(s.cost_input_microcents, s.operation IN ('chat', 'text_completion', 'generate_content', 'embeddings', 'reranker'))  AS cost_input_microcents,
    sumIf(s.cost_output_microcents, s.operation IN ('chat', 'text_completion', 'generate_content', 'embeddings', 'reranker')) AS cost_output_microcents,
    sumIf(s.cost_total_microcents, s.operation IN ('chat', 'text_completion', 'generate_content', 'embeddings', 'reranker'))  AS cost_total_microcents,
    argMaxIfState(s.user_id, s.start_time, s.user_id != '')          AS user_id,
    argMaxIfState(s.user_email, s.start_time, s.user_email != '')    AS user_email,
    groupUniqArrayArray(s.tags)                                      AS tags,
    maxMap(s.metadata)                                               AS metadata,
    groupUniqArrayIfState(s.model, s.model != '')                    AS models,
    groupUniqArrayIfState(s.provider, s.provider != '')              AS providers,
    groupUniqArrayIfState(s.service_name, s.service_name != '')      AS service_names,
    groupUniqArrayIfState(s.agent_name, s.agent_name != '')          AS agent_names,
    groupUniqArrayIfState(s.tool_name, (s.operation = 'execute_tool') AND (s.tool_name != '')) AS tools,
    groupUniqArrayArray(arrayFilter(n -> n != '', s.tool_names))     AS defined_tools,
    argMaxIfState(s.simulation_id, s.start_time, s.simulation_id != '') AS simulation_id,
    argMinIfState(s.span_id, s.start_time, (s.parent_span_id = '') OR (s.parent_span_id = '0000000000000000')) AS root_span_id,
    argMinIfState(s.name, s.start_time, (s.parent_span_id = '') OR (s.parent_span_id = '0000000000000000')) AS root_span_name,
    argMinIfState(s.input_messages, s.start_time, s.input_messages != '' AND s.operation IN ('chat', 'text_completion', 'generate_content')) AS input_messages,
    argMaxIfState(s.input_messages, s.end_time, s.output_messages != '' AND s.operation IN ('chat', 'text_completion', 'generate_content')) AS last_input_messages,
    argMaxIfState(s.output_messages, s.end_time, s.output_messages != '' AND s.operation IN ('chat', 'text_completion', 'generate_content')) AS output_messages,
    argMinIfState(s.system_instructions, s.start_time, s.system_instructions != '' AND s.operation IN ('chat', 'text_completion', 'generate_content', 'invoke_agent')) AS system_instructions,
    max(s.retention_days)                                            AS retention_days
FROM spans AS s
GROUP BY
    s.organization_id,
    s.project_id,
    coalesce(nullIf(s.session_id, ''), toString(s.trace_id));

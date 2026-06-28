-- +goose NO TRANSACTION
-- +goose Up

-- Surface system instructions emitted on the agent-invocation span.
--
-- 00040 gated the conversation/usage rollup to real model-call leaves
-- (`chat` / `text_completion` / `generate_content`) because the agent wrapper
-- span carries a lossy conversation and double-counted usage. But the OTEL
-- gen_ai convention (e.g. Vercel AI SDK v7 via @ai-sdk/otel) emits
-- `gen_ai.system_instructions` ONLY on the `invoke_agent` span — the leaf `chat`
-- spans never carry it — so the gate dropped system instructions from the
-- trace/session rollup entirely.
--
-- Fix: allow `invoke_agent` into the `system_instructions` aggregate only
-- (messages + usage stay leaf-only — the wrapper span is lossy there). argMinIf
-- still picks the earliest non-empty span, so integrations that put system on the
-- leaf are unaffected (same content, and the wrapper either lacks it or precedes
-- it with identical text). Redefines the two materialized views only; column
-- types unchanged, existing states stay valid — new-data-only.

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

-- +goose Down

-- Restore the 00040 gate (system_instructions limited to model-call leaves).

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
    groupUniqArrayIfState(tool_name, operation = 'execute_tool' AND tool_name != '') AS tools,
    groupUniqArrayArray(arrayFilter(n -> n != '', tool_names)) AS defined_tools,
    argMinIfState(span_id, start_time, parent_span_id = '') AS root_span_id,
    argMinIfState(name, start_time, parent_span_id = '') AS root_span_name,
    argMinIfState(spans.input_messages, start_time, spans.input_messages != '' AND operation IN ('chat', 'text_completion', 'generate_content')) AS input_messages,
    argMaxIfState(spans.input_messages, end_time, spans.output_messages != '' AND operation IN ('chat', 'text_completion', 'generate_content')) AS last_input_messages,
    argMaxIfState(spans.output_messages, end_time, spans.output_messages != '' AND operation IN ('chat', 'text_completion', 'generate_content')) AS output_messages,
    argMinIfState(spans.system_instructions, start_time, spans.system_instructions != '' AND operation IN ('chat', 'text_completion', 'generate_content')) AS system_instructions,
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
    groupUniqArrayIfState(s.tool_name, (s.operation = 'execute_tool') AND (s.tool_name != '')) AS tools,
    groupUniqArrayArray(arrayFilter(n -> n != '', s.tool_names))     AS defined_tools,
    argMaxIfState(s.simulation_id, s.start_time, s.simulation_id != '') AS simulation_id,
    argMinIfState(s.span_id, s.start_time, (s.parent_span_id = '') OR (s.parent_span_id = '0000000000000000')) AS root_span_id,
    argMinIfState(s.name, s.start_time, (s.parent_span_id = '') OR (s.parent_span_id = '0000000000000000')) AS root_span_name,
    argMinIfState(s.input_messages, s.start_time, s.input_messages != '' AND s.operation IN ('chat', 'text_completion', 'generate_content')) AS input_messages,
    argMaxIfState(s.input_messages, s.end_time, s.output_messages != '' AND s.operation IN ('chat', 'text_completion', 'generate_content')) AS last_input_messages,
    argMaxIfState(s.output_messages, s.end_time, s.output_messages != '' AND s.operation IN ('chat', 'text_completion', 'generate_content')) AS output_messages,
    argMinIfState(s.system_instructions, s.start_time, s.system_instructions != '' AND s.operation IN ('chat', 'text_completion', 'generate_content')) AS system_instructions,
    max(s.retention_days)                                            AS retention_days
FROM spans AS s
GROUP BY
    s.organization_id,
    s.project_id,
    coalesce(nullIf(s.session_id, ''), toString(s.trace_id));

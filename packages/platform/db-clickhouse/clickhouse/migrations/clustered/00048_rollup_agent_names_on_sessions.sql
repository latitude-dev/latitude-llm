-- +goose NO TRANSACTION
-- +goose Up

-- Persist the distinct agent names on the sessions rollup — clustered variant.
-- Body restates the current sessions_mv (00043) with `agent_names` added after
-- `service_names`; copy it verbatim so the other rollups are preserved.

ALTER TABLE sessions ON CLUSTER default
    ADD COLUMN IF NOT EXISTS agent_names
        AggregateFunction(groupUniqArrayIf, String, UInt8) CODEC(ZSTD(1)) AFTER service_names;

DROP VIEW IF EXISTS sessions_mv ON CLUSTER default;

CREATE MATERIALIZED VIEW IF NOT EXISTS sessions_mv ON CLUSTER default TO sessions
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

-- +goose Down

-- Restore the 00043 sessions_mv (no agent_names) and drop the column.

DROP VIEW IF EXISTS sessions_mv ON CLUSTER default;

ALTER TABLE sessions ON CLUSTER default
    DROP COLUMN IF EXISTS agent_names;

CREATE MATERIALIZED VIEW IF NOT EXISTS sessions_mv ON CLUSTER default TO sessions
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

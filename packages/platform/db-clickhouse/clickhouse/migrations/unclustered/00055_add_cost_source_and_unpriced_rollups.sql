-- +goose NO TRANSACTION
-- +goose Up

-- Record where each span's cost came from, so a stored 0 can be told apart: a provider reporting a
-- free call, versus token usage no models.dev pricing matched. Both used to land as 0 with
-- cost_is_estimated = 0, which reads as "the provider said it was free".
--
-- Rows stored before this column exist read back as the empty string rather than being mutated;
-- `parseCostSource` classifies those from the old columns on the way out.
--
-- `cost_priced_provider` / `cost_priced_model` record the catalog entry an estimate came from, which
-- is often neither the provider nor the model the instrumentation reported: a gateway names itself as
-- the provider and carries the vendor in the model slug, and a dated model id resolves to its base
-- entry. Split rather than one `provider/model` string so each side can be compared against what was
-- reported (`cost_priced_model != model` finds partial model resolution) and grouped on directly.
-- Both empty unless we priced the span ourselves, and empty on every row stored before this
-- migration, including ones `parseCostSource` back-classifies as estimated. Empty therefore means
-- "not recorded" and cannot be inferred away from `cost_source`.
--
-- The rollup bodies restate the current traces_mv (00049) and sessions_mv (00048) with
-- `unpriced_span_count` added after `cost_total_microcents`; copied verbatim so the other rollups
-- are preserved. The count carries the same operation gate as the cost sums, so a non-zero count
-- always means the cost total beside it understates real spend.

-- Must stay one ALTER. Every ALTER on a replicated table bumps the shared metadata version, and the
-- next one fails with code 517 until each server has caught up; split into three, the retry re-runs
-- the first and re-bumps the version, so it never converges. The commands still apply in order, so
-- each AFTER can name the column added before it.
ALTER TABLE spans
    ADD COLUMN IF NOT EXISTS cost_source LowCardinality(String)
        DEFAULT '' CODEC(ZSTD(1)) AFTER cost_is_estimated,
    ADD COLUMN IF NOT EXISTS cost_priced_provider LowCardinality(String)
        DEFAULT '' CODEC(ZSTD(1)) AFTER cost_source,
    ADD COLUMN IF NOT EXISTS cost_priced_model LowCardinality(String)
        DEFAULT '' CODEC(ZSTD(1)) AFTER cost_priced_provider;

ALTER TABLE traces
    ADD COLUMN IF NOT EXISTS unpriced_span_count
        SimpleAggregateFunction(sum, UInt64) CODEC(T64, ZSTD(1)) AFTER cost_total_microcents;

ALTER TABLE sessions
    ADD COLUMN IF NOT EXISTS unpriced_span_count
        SimpleAggregateFunction(sum, UInt64) CODEC(T64, ZSTD(1)) AFTER cost_total_microcents;

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
    countIf(cost_source = 'unpriced' AND operation IN ('chat', 'text_completion', 'generate_content', 'embeddings', 'reranker')) AS unpriced_span_count,
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
    countIf(s.cost_source = 'unpriced' AND s.operation IN ('chat', 'text_completion', 'generate_content', 'embeddings', 'reranker')) AS unpriced_span_count,
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

-- Restore the 00049 traces_mv and 00048 sessions_mv, then drop the columns.

DROP VIEW IF EXISTS traces_mv;

DROP VIEW IF EXISTS sessions_mv;

ALTER TABLE spans
    DROP COLUMN IF EXISTS cost_source,
    DROP COLUMN IF EXISTS cost_priced_provider,
    DROP COLUMN IF EXISTS cost_priced_model;

ALTER TABLE traces
    DROP COLUMN IF EXISTS unpriced_span_count;

ALTER TABLE sessions
    DROP COLUMN IF EXISTS unpriced_span_count;

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

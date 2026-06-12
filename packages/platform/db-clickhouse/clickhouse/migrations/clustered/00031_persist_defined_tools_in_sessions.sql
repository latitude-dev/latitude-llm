-- +goose NO TRANSACTION
-- +goose Up

-- Persist defined tools on the sessions rollup — clustered variant.
-- See unclustered/00031_persist_defined_tools_in_sessions.sql for full notes.

ALTER TABLE sessions ON CLUSTER default
    ADD COLUMN IF NOT EXISTS defined_tools
        SimpleAggregateFunction(groupUniqArrayArray, Array(String)) CODEC(ZSTD(1)) AFTER tools;

DROP VIEW IF EXISTS sessions_mv ON CLUSTER default;

-- View body restates 00028 with `defined_tools` added; see 00016 for column semantics.
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

    sum(if(
        (s.parent_span_id = '' OR s.parent_span_id = '0000000000000000')
            AND s.end_time > s.start_time,
        reinterpretAsInt64(s.end_time) - reinterpretAsInt64(s.start_time),
        toInt64(0)
    ))                                                               AS duration_ns,

    min(if(
        s.time_to_first_token_ns > 0,
        addNanoseconds(s.start_time, toInt64(s.time_to_first_token_ns)),
        toDateTime64('2261-01-01 00:00:00.000000000', 9, 'UTC')
    ))                                                               AS time_of_first_token,

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
    groupUniqArrayIfState(s.tool_name,
        s.operation = 'execute_tool' AND s.tool_name != '')          AS tools,
    groupUniqArrayArray(arrayFilter(n -> n != '', s.tool_names))     AS defined_tools,
    argMaxIfState(s.simulation_id, s.start_time, s.simulation_id != '') AS simulation_id,

    argMinIfState(s.span_id, s.start_time,
        s.parent_span_id = '' OR s.parent_span_id = '0000000000000000') AS root_span_id,
    argMinIfState(s.name, s.start_time,
        s.parent_span_id = '' OR s.parent_span_id = '0000000000000000') AS root_span_name,
    argMinIfState(s.input_messages, s.start_time, s.input_messages != '')  AS input_messages,
    argMaxIfState(s.input_messages, s.end_time, s.output_messages != '')   AS last_input_messages,
    argMaxIfState(s.output_messages, s.end_time, s.output_messages != '')  AS output_messages,
    argMinIfState(s.system_instructions, s.start_time, s.system_instructions != '') AS system_instructions,

    max(s.retention_days)                                            AS retention_days

FROM spans AS s
GROUP BY
    s.organization_id,
    s.project_id,
    coalesce(nullIf(s.session_id, ''), toString(s.trace_id));

-- +goose Down

-- Mirrors the Up: drop the view first (it references `defined_tools`), drop
-- the column, then restore the 00028 view definition.

DROP VIEW IF EXISTS sessions_mv ON CLUSTER default;

ALTER TABLE sessions ON CLUSTER default
    DROP COLUMN IF EXISTS defined_tools;

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

    sum(if(
        (s.parent_span_id = '' OR s.parent_span_id = '0000000000000000')
            AND s.end_time > s.start_time,
        reinterpretAsInt64(s.end_time) - reinterpretAsInt64(s.start_time),
        toInt64(0)
    ))                                                               AS duration_ns,

    min(if(
        s.time_to_first_token_ns > 0,
        addNanoseconds(s.start_time, toInt64(s.time_to_first_token_ns)),
        toDateTime64('2261-01-01 00:00:00.000000000', 9, 'UTC')
    ))                                                               AS time_of_first_token,

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
    groupUniqArrayIfState(s.tool_name,
        s.operation = 'execute_tool' AND s.tool_name != '')          AS tools,
    argMaxIfState(s.simulation_id, s.start_time, s.simulation_id != '') AS simulation_id,

    argMinIfState(s.span_id, s.start_time,
        s.parent_span_id = '' OR s.parent_span_id = '0000000000000000') AS root_span_id,
    argMinIfState(s.name, s.start_time,
        s.parent_span_id = '' OR s.parent_span_id = '0000000000000000') AS root_span_name,
    argMinIfState(s.input_messages, s.start_time, s.input_messages != '')  AS input_messages,
    argMaxIfState(s.input_messages, s.end_time, s.output_messages != '')   AS last_input_messages,
    argMaxIfState(s.output_messages, s.end_time, s.output_messages != '')  AS output_messages,
    argMinIfState(s.system_instructions, s.start_time, s.system_instructions != '') AS system_instructions,

    max(s.retention_days)                                            AS retention_days

FROM spans AS s
GROUP BY
    s.organization_id,
    s.project_id,
    coalesce(nullIf(s.session_id, ''), toString(s.trace_id));

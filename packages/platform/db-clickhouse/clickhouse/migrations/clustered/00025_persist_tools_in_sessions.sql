-- +goose NO TRANSACTION
-- +goose Up

-- Persist called tools on the sessions rollup — clustered variant.
-- See unclustered/00025_persist_tools_in_sessions.sql for full notes.
--
-- Persist called tools on the sessions rollup, mirroring models/providers,
-- so tools filters read a plain array column instead of a correlated spans
-- subquery. Only *called* tools (execute_tool spans) are rolled up — tools
-- *defined* on chat spans (tool_names) stay a spans-only concern: they are
-- per-agent-config metadata, not session activity, and the sessions/traces
-- tools filter means "at least one call of the tool".
--
-- 00027 backfills rows written before this MV rebuild. Spans ingested in the
-- DROP→CREATE VIEW window miss the rollup (same exposure 00016 accepted);
-- the backfill repairs `tools` for that window because uniq-array states
-- merge idempotently.

ALTER TABLE sessions ON CLUSTER default
    ADD COLUMN IF NOT EXISTS tools
        AggregateFunction(groupUniqArrayIf, String, UInt8) CODEC(ZSTD(1)) AFTER service_names;

DROP VIEW IF EXISTS sessions_mv ON CLUSTER default;

CREATE MATERIALIZED VIEW IF NOT EXISTS sessions_mv ON CLUSTER default TO sessions
AS SELECT
    s.organization_id,
    s.project_id,
    -- Every trace must paginate as a session (see 0-problems.md core constraint).
    -- Spans with no gen_ai.conversation.id synthesize a session keyed on
    -- trace_id, so orphan traces surface as 1-trace sessions.
    coalesce(nullIf(s.session_id, ''), toString(s.trace_id))         AS session_id,

    uniqExactState(s.trace_id)                                       AS trace_count,
    groupUniqArrayState(s.trace_id)                                  AS trace_ids,
    count()                                                          AS span_count,
    countIf(s.status_code = 2)                                       AS error_count,

    min(s.start_time)                                                AS min_start_time,
    max(s.end_time)                                                  AS max_end_time,
    -- Latest span start in the session. Sort by this DESC for
    -- "most recently active" sessions — mirrors how traces use
    -- start_time as the activity-recency signal.
    max(s.start_time)                                                AS max_start_time,

    -- Active execution time: sum of root-span durations across the session's
    -- traces. Wall-clock is recoverable from min/max_*_time directly. See
    -- 1-parity-traces-sessions.md §"On duration_ns semantics" for rationale
    -- and limitations (multi-root, concurrent traces, runaway end_time).
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
    groupUniqArrayArray(s.tags)                                      AS tags,
    maxMap(s.metadata)                                               AS metadata,
    groupUniqArrayIfState(s.model, s.model != '')                    AS models,
    groupUniqArrayIfState(s.provider, s.provider != '')              AS providers,
    groupUniqArrayIfState(s.service_name, s.service_name != '')      AS service_names,
    groupUniqArrayIfState(s.tool_name,
        s.operation = 'execute_tool' AND s.tool_name != '')          AS tools,
    argMaxIfState(s.simulation_id, s.start_time, s.simulation_id != '') AS simulation_id,

    -- Root detection: both bare empty and the all-zeros OTLP sentinel count
    -- as roots. Same predicate used for duration_ns above.
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
-- Repeat the coalesce expression in GROUP BY (rather than referencing the
-- `session_id` SELECT alias). `spans` also has a `session_id` column, and
-- with `prefer_column_name_to_alias = 1` CH would group by the raw column
-- instead of the coalesced key — silently collapsing every orphan into a
-- single empty-string session row.
GROUP BY
    s.organization_id,
    s.project_id,
    coalesce(nullIf(s.session_id, ''), toString(s.trace_id));

-- +goose Down

-- Mirrors the Up: drop the view first (it references `tools`), drop the
-- column, then restore the 00016 view definition.

DROP VIEW IF EXISTS sessions_mv ON CLUSTER default;

ALTER TABLE sessions ON CLUSTER default
    DROP COLUMN IF EXISTS tools;

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
    groupUniqArrayArray(s.tags)                                      AS tags,
    maxMap(s.metadata)                                               AS metadata,
    groupUniqArrayIfState(s.model, s.model != '')                    AS models,
    groupUniqArrayIfState(s.provider, s.provider != '')              AS providers,
    groupUniqArrayIfState(s.service_name, s.service_name != '')      AS service_names,
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

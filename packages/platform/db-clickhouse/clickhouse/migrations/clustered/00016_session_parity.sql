-- +goose NO TRANSACTION
-- +goose Up

-- ═══════════════════════════════════════════════════════════
-- Sessions parity with traces (LAT-604) — clustered variant.
-- See unclustered/00016_session_parity.sql for full notes.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE sessions ON CLUSTER default
    DROP COLUMN IF EXISTS duration_ns;

ALTER TABLE sessions ON CLUSTER default
    ADD COLUMN IF NOT EXISTS duration_ns
        SimpleAggregateFunction(sum, Int64) DEFAULT 0 CODEC(T64, ZSTD(1)) AFTER max_end_time,
    ADD COLUMN IF NOT EXISTS time_of_first_token
        SimpleAggregateFunction(min, DateTime64(9, 'UTC')) CODEC(Delta(8), ZSTD(1)) AFTER duration_ns,
    ADD COLUMN IF NOT EXISTS time_to_first_token_ns Int64 ALIAS if(
        time_of_first_token < toDateTime64('2261-01-01', 9, 'UTC'),
        reinterpretAsInt64(time_of_first_token) - reinterpretAsInt64(min_start_time),
        0
    ) AFTER time_of_first_token,
    ADD COLUMN IF NOT EXISTS root_span_id
        AggregateFunction(argMinIf, FixedString(16), DateTime64(9, 'UTC'), UInt8) CODEC(ZSTD(1)) AFTER simulation_id,
    ADD COLUMN IF NOT EXISTS root_span_name
        AggregateFunction(argMinIf, String, DateTime64(9, 'UTC'), UInt8) CODEC(ZSTD(1)) AFTER root_span_id,
    ADD COLUMN IF NOT EXISTS input_messages
        AggregateFunction(argMinIf, String, DateTime64(9, 'UTC'), UInt8) CODEC(ZSTD(3)) AFTER root_span_name,
    ADD COLUMN IF NOT EXISTS last_input_messages
        AggregateFunction(argMaxIf, String, DateTime64(9, 'UTC'), UInt8) CODEC(ZSTD(3)) AFTER input_messages,
    ADD COLUMN IF NOT EXISTS output_messages
        AggregateFunction(argMaxIf, String, DateTime64(9, 'UTC'), UInt8) CODEC(ZSTD(3)) AFTER last_input_messages,
    ADD COLUMN IF NOT EXISTS system_instructions
        AggregateFunction(argMinIf, String, DateTime64(9, 'UTC'), UInt8) CODEC(ZSTD(3)) AFTER output_messages,
    ADD COLUMN IF NOT EXISTS retention_days
        SimpleAggregateFunction(max, UInt16) DEFAULT 90 CODEC(T64, ZSTD(1));

ALTER TABLE sessions ON CLUSTER default
    MODIFY TTL toDateTime(min_start_time) + toIntervalDay(retention_days + 30) DELETE;

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
-- See unclustered/00016 for why GROUP BY repeats the coalesce expression
-- instead of referencing the `session_id` SELECT alias.
GROUP BY
    s.organization_id,
    s.project_id,
    coalesce(nullIf(s.session_id, ''), toString(s.trace_id));

-- +goose Down

DROP VIEW IF EXISTS sessions_mv ON CLUSTER default;

ALTER TABLE sessions ON CLUSTER default
    REMOVE TTL;

ALTER TABLE sessions ON CLUSTER default
    DROP COLUMN IF EXISTS retention_days,
    DROP COLUMN IF EXISTS system_instructions,
    DROP COLUMN IF EXISTS output_messages,
    DROP COLUMN IF EXISTS last_input_messages,
    DROP COLUMN IF EXISTS input_messages,
    DROP COLUMN IF EXISTS root_span_name,
    DROP COLUMN IF EXISTS root_span_id,
    DROP COLUMN IF EXISTS time_to_first_token_ns,
    DROP COLUMN IF EXISTS time_of_first_token,
    DROP COLUMN IF EXISTS duration_ns;

ALTER TABLE sessions ON CLUSTER default
    ADD COLUMN IF NOT EXISTS duration_ns Int64 ALIAS
        reinterpretAsInt64(max_end_time) - reinterpretAsInt64(min_start_time) AFTER max_end_time;

CREATE MATERIALIZED VIEW IF NOT EXISTS sessions_mv ON CLUSTER default TO sessions
AS SELECT
    s.organization_id,
    s.project_id,
    s.session_id,

    uniqExactState(s.trace_id)                                       AS trace_count,
    groupUniqArrayState(s.trace_id)                                  AS trace_ids,
    count()                                                          AS span_count,
    countIf(s.status_code = 2)                                       AS error_count,

    min(s.start_time)                                                AS min_start_time,
    max(s.end_time)                                                  AS max_end_time,

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
    argMaxIfState(s.simulation_id, s.start_time, s.simulation_id != '') AS simulation_id

FROM spans AS s
WHERE s.session_id != ''
GROUP BY s.organization_id, s.project_id, s.session_id;

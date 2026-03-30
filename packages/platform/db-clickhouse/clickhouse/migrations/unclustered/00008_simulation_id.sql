-- +goose NO TRANSACTION
-- +goose Up

-- ═══════════════════════════════════════════════════════════
-- Spans: add simulation_id column and bloom filter index
-- ═══════════════════════════════════════════════════════════

ALTER TABLE spans
    ADD COLUMN IF NOT EXISTS simulation_id FixedString(24) DEFAULT '' CODEC(ZSTD(1)) AFTER api_key_id,
    ADD INDEX IF NOT EXISTS idx_simulation_id simulation_id TYPE bloom_filter(0.01) GRANULARITY 2;

-- ═══════════════════════════════════════════════════════════
-- Traces: add simulation_id and recreate MV
-- ═══════════════════════════════════════════════════════════

DROP VIEW IF EXISTS traces_mv;

ALTER TABLE traces
    ADD COLUMN IF NOT EXISTS simulation_id AggregateFunction(argMaxIf, FixedString(24), DateTime64(9, 'UTC'), UInt8) CODEC(ZSTD(1)) AFTER metadata;

CREATE MATERIALIZED VIEW IF NOT EXISTS traces_mv TO traces
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
    argMaxIfState(simulation_id, start_time, simulation_id != '')    AS simulation_id,

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

-- ═══════════════════════════════════════════════════════════
-- Sessions: add simulation_id and recreate MV
-- ═══════════════════════════════════════════════════════════

DROP VIEW IF EXISTS sessions_mv;

ALTER TABLE sessions
    ADD COLUMN IF NOT EXISTS simulation_id AggregateFunction(argMaxIf, FixedString(24), DateTime64(9, 'UTC'), UInt8) CODEC(ZSTD(1)) AFTER service_names;

CREATE MATERIALIZED VIEW IF NOT EXISTS sessions_mv TO sessions
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

-- +goose Down

-- Restore sessions MV without simulation_id
DROP VIEW IF EXISTS sessions_mv;

ALTER TABLE sessions
    DROP COLUMN IF EXISTS simulation_id;

CREATE MATERIALIZED VIEW IF NOT EXISTS sessions_mv TO sessions
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
    groupUniqArrayIfState(s.service_name, s.service_name != '')      AS service_names

FROM spans AS s
WHERE s.session_id != ''
GROUP BY s.organization_id, s.project_id, s.session_id;

-- Restore traces MV without simulation_id
DROP VIEW IF EXISTS traces_mv;

ALTER TABLE traces
    DROP COLUMN IF EXISTS simulation_id;

CREATE MATERIALIZED VIEW IF NOT EXISTS traces_mv TO traces
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

-- Revert spans column
ALTER TABLE spans
    DROP INDEX IF EXISTS idx_simulation_id,
    DROP COLUMN IF EXISTS simulation_id;

-- +goose NO TRANSACTION
-- +goose Up

ALTER TABLE spans ON CLUSTER default
    ADD COLUMN IF NOT EXISTS retention_days UInt16 DEFAULT 90 CODEC(T64, ZSTD(1)) AFTER ingested_at,
    MODIFY TTL toDateTime(start_time) + toIntervalDay(retention_days + 30) DELETE;

DROP VIEW IF EXISTS traces_mv ON CLUSTER default;

ALTER TABLE traces ON CLUSTER default
    ADD COLUMN IF NOT EXISTS retention_days SimpleAggregateFunction(max, UInt16) DEFAULT 90 CODEC(T64, ZSTD(1)),
    MODIFY TTL toDateTime(min_start_time) + toIntervalDay(retention_days + 30) DELETE;

CREATE MATERIALIZED VIEW IF NOT EXISTS traces_mv ON CLUSTER default TO traces
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

    argMaxIfState(session_id, start_time, session_id != '')         AS session_id,
    argMaxIfState(user_id, start_time, user_id != '')               AS user_id,
    groupUniqArrayArray(tags)                                       AS tags,
    maxMap(metadata)                                                AS metadata,
    argMaxIfState(simulation_id, start_time, simulation_id != '')   AS simulation_id,
    max(retention_days)                                             AS retention_days,

    groupUniqArrayIfState(model, model != '')                       AS models,
    groupUniqArrayIfState(provider, provider != '')                 AS providers,
    groupUniqArrayIfState(service_name, service_name != '')         AS service_names,

    argMinIfState(span_id, start_time, parent_span_id = '')         AS root_span_id,
    argMinIfState(name, start_time, parent_span_id = '')            AS root_span_name,
    argMinIfState(spans.input_messages, start_time, spans.input_messages != '') AS input_messages,
    argMaxIfState(spans.input_messages, end_time, spans.output_messages != '')  AS last_input_messages,
    argMaxIfState(spans.output_messages, end_time, spans.output_messages != '') AS output_messages,
    argMinIfState(spans.system_instructions, start_time, spans.system_instructions != '') AS system_instructions

FROM spans
GROUP BY organization_id, project_id, trace_id;

ALTER TABLE trace_search_documents ON CLUSTER default
    ADD COLUMN IF NOT EXISTS retention_days UInt16 DEFAULT 90 CODEC(T64, ZSTD(1)) AFTER indexed_at,
    MODIFY TTL toDateTime(start_time) + toIntervalDay(retention_days + 30) DELETE;

ALTER TABLE trace_search_embeddings ON CLUSTER default
    ADD COLUMN IF NOT EXISTS retention_days UInt16 DEFAULT 30 CODEC(T64, ZSTD(1)) AFTER indexed_at,
    MODIFY TTL toDateTime(start_time) + toIntervalDay(retention_days + 30) DELETE;

-- +goose Down

ALTER TABLE trace_search_embeddings ON CLUSTER default
    REMOVE TTL,
    MODIFY TTL toDateTime(start_time) + INTERVAL 30 DAY DELETE,
    DROP COLUMN IF EXISTS retention_days;

ALTER TABLE trace_search_documents ON CLUSTER default
    REMOVE TTL,
    MODIFY TTL toDateTime(start_time) + INTERVAL 90 DAY DELETE,
    DROP COLUMN IF EXISTS retention_days;

DROP VIEW IF EXISTS traces_mv ON CLUSTER default;

ALTER TABLE traces ON CLUSTER default
    REMOVE TTL,
    DROP COLUMN IF EXISTS retention_days;

CREATE MATERIALIZED VIEW IF NOT EXISTS traces_mv ON CLUSTER default TO traces
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

    argMaxIfState(session_id, start_time, session_id != '')         AS session_id,
    argMaxIfState(user_id, start_time, user_id != '')               AS user_id,
    groupUniqArrayArray(tags)                                       AS tags,
    maxMap(metadata)                                                AS metadata,
    argMaxIfState(simulation_id, start_time, simulation_id != '')   AS simulation_id,

    groupUniqArrayIfState(model, model != '')                       AS models,
    groupUniqArrayIfState(provider, provider != '')                 AS providers,
    groupUniqArrayIfState(service_name, service_name != '')         AS service_names,

    argMinIfState(span_id, start_time, parent_span_id = '')         AS root_span_id,
    argMinIfState(name, start_time, parent_span_id = '')            AS root_span_name,
    argMinIfState(spans.input_messages, start_time, spans.input_messages != '') AS input_messages,
    argMaxIfState(spans.input_messages, end_time, spans.output_messages != '')  AS last_input_messages,
    argMaxIfState(spans.output_messages, end_time, spans.output_messages != '') AS output_messages,
    argMinIfState(spans.system_instructions, start_time, spans.system_instructions != '') AS system_instructions

FROM spans
GROUP BY organization_id, project_id, trace_id;

ALTER TABLE spans ON CLUSTER default
    REMOVE TTL,
    DROP COLUMN IF EXISTS retention_days;

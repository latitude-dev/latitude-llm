-- +goose NO TRANSACTION
-- +goose Up

-- Add user_id and metadata columns to spans
ALTER TABLE spans
    ADD COLUMN IF NOT EXISTS user_id String DEFAULT '' CODEC(ZSTD(1)) AFTER session_id;

ALTER TABLE spans
    ADD COLUMN IF NOT EXISTS metadata Map(LowCardinality(String), String) DEFAULT map() CODEC(ZSTD(1)) AFTER tags;

ALTER TABLE spans
    ADD INDEX IF NOT EXISTS idx_user_id user_id TYPE bloom_filter(0.01) GRANULARITY 2;

-- Recreate traces_mv with new columns.
-- Drop the old view first, then alter the destination table, then recreate.
DROP VIEW IF EXISTS traces_mv;

ALTER TABLE traces
    ADD COLUMN IF NOT EXISTS session_id AggregateFunction(argMaxIf, String, DateTime64(9, 'UTC'), UInt8) CODEC(ZSTD(1)) AFTER cost_total_microcents;

ALTER TABLE traces
    ADD COLUMN IF NOT EXISTS user_id AggregateFunction(argMaxIf, String, DateTime64(9, 'UTC'), UInt8) CODEC(ZSTD(1)) AFTER session_id;

ALTER TABLE traces
    ADD COLUMN IF NOT EXISTS metadata SimpleAggregateFunction(maxMap, Map(String, String)) CODEC(ZSTD(1)) AFTER tags;

ALTER TABLE traces
    ADD COLUMN IF NOT EXISTS last_input_messages AggregateFunction(argMaxIf, String, DateTime64(9, 'UTC'), UInt8) CODEC(ZSTD(3)) AFTER input_messages;

ALTER TABLE traces
    ADD COLUMN IF NOT EXISTS system_instructions AggregateFunction(argMinIf, String, DateTime64(9, 'UTC'), UInt8) CODEC(ZSTD(3)) AFTER output_messages;

CREATE MATERIALIZED VIEW IF NOT EXISTS traces_mv TO traces
AS SELECT
    organization_id,
    project_id,
    trace_id,

    count()                                                         AS span_count,
    countIf(status_code = 2)                                        AS error_count,
    min(start_time)                                                 AS min_start_time,
    max(end_time)                                                   AS max_end_time,
    max(status_code)                                                AS overall_status,

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

-- +goose Down
DROP VIEW IF EXISTS traces_mv;

ALTER TABLE spans DROP INDEX IF EXISTS idx_user_id;
ALTER TABLE spans DROP COLUMN IF EXISTS metadata;
ALTER TABLE spans DROP COLUMN IF EXISTS user_id;

-- Recreate original traces_mv without new columns
ALTER TABLE traces DROP COLUMN IF EXISTS system_instructions;
ALTER TABLE traces DROP COLUMN IF EXISTS last_input_messages;
ALTER TABLE traces DROP COLUMN IF EXISTS metadata;
ALTER TABLE traces DROP COLUMN IF EXISTS user_id;
ALTER TABLE traces DROP COLUMN IF EXISTS session_id;

CREATE MATERIALIZED VIEW IF NOT EXISTS traces_mv TO traces
AS SELECT
    organization_id,
    project_id,
    trace_id,

    count()                                                         AS span_count,
    countIf(status_code = 2)                                        AS error_count,
    min(start_time)                                                 AS min_start_time,
    max(end_time)                                                   AS max_end_time,
    max(status_code)                                                AS overall_status,

    sum(tokens_input)                                               AS tokens_input,
    sum(tokens_output)                                              AS tokens_output,
    sum(tokens_cache_read)                                          AS tokens_cache_read,
    sum(tokens_cache_create)                                        AS tokens_cache_create,
    sum(tokens_reasoning)                                           AS tokens_reasoning,
    sum(tokens_total)                                               AS tokens_total,

    sum(cost_input_microcents)                                      AS cost_input_microcents,
    sum(cost_output_microcents)                                     AS cost_output_microcents,
    sum(cost_total_microcents)                                      AS cost_total_microcents,

    groupUniqArrayArray(tags)                                       AS tags,

    groupUniqArrayIfState(model, model != '')                       AS models,
    groupUniqArrayIfState(provider, provider != '')                 AS providers,
    groupUniqArrayIfState(service_name, service_name != '')         AS service_names,

    argMinIfState(span_id, start_time, parent_span_id = '')         AS root_span_id,
    argMinIfState(name, start_time, parent_span_id = '')            AS root_span_name,
    argMinIfState(input_messages, start_time, input_messages != '')  AS input_messages,
    argMaxIfState(output_messages, end_time, output_messages != '') AS output_messages

FROM spans
GROUP BY organization_id, project_id, trace_id;

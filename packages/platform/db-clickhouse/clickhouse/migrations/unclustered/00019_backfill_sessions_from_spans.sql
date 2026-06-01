-- +goose NO TRANSACTION
-- +goose Up

-- ═══════════════════════════════════════════════════════════
-- Backfill `sessions` from `spans` (LAT-637)
--
-- ClickHouse materialized views are insert triggers — they only aggregate
-- spans ingested *after* the view exists. Two classes of historical rows are
-- therefore wrong in `sessions`:
--
--   1. Orphan traces (spans with no gen_ai.conversation.id) ingested before
--      00016_session_parity (LAT-604) taught `sessions_mv` to synthesize a
--      session per orphan trace. These have NO session row at all, so they
--      fall off the session-paginated listings entirely.
--   2. Named sessions ingested before 00016 have a row, but it was written by
--      the old MV and is missing every column 00016 added (duration_ns as a
--      real SimpleAggregateFunction, max_start_time, time_of_first_token,
--      root_span_id/name, input/last_input/output_messages,
--      system_instructions, retention_days).
--
-- The table is small (≈331k sessions from ≈4.3M spans in production), so the
-- cleanest fix is a full rebuild from the source-of-truth `spans` table.
--
-- Mechanism — drop the MV for the duration of the rebuild, then recreate it:
--   - DROP VIEW sessions_mv first. From this moment until the CREATE at the
--     end, span ingestion keeps working normally (the MV is independent of
--     the spans table), but new spans don't produce session rows. This is a
--     deliberately accepted ingestion gap of seconds during the deploy — the
--     trade for not having to reason about any overlap between the live MV
--     and the rebuild INSERT.
--   - TRUNCATE clears the stale rows.
--   - INSERT repopulates from `spans` using the post-00016 `sessions_mv`
--     aggregation verbatim. Because the MV is dropped, there is no live
--     writer to overlap with, so we do NOT use FROM spans FINAL — matching
--     the live MV's non-dedup semantics exactly, and keeping memory pressure
--     low (FINAL forces merge-on-read across every span part, which can be
--     heavy at scale even though the GROUP BY output is small).
--   - CREATE MATERIALIZED VIEW recreates sessions_mv with the same definition
--     as 00016 so live aggregation resumes. The MV body MUST stay in sync
--     with the unclustered/00016_session_parity.sql definition.
--
-- The TRUNCATE+INSERT approach is what makes the rebuild safe: `sessions` is
-- an AggregatingMergeTree, so re-inserting into existing rows would merge
-- partial states and double-count — there is nothing to merge into after
-- TRUNCATE. Columns are listed explicitly so the insert is robust to column
-- reordering and the `time_to_first_token_ns` ALIAS on `sessions` is skipped.
--
-- Re-runnability: DROP IF EXISTS + CREATE IF NOT EXISTS, combined with
-- TRUNCATE being idempotent and the INSERT being deterministic, mean a goose
-- failure mid-migration can be recovered by re-running.
-- ═══════════════════════════════════════════════════════════

DROP VIEW IF EXISTS sessions_mv;

TRUNCATE TABLE sessions;

INSERT INTO sessions (
    organization_id, project_id, session_id,
    trace_count, trace_ids, span_count, error_count,
    min_start_time, max_end_time, max_start_time, duration_ns, time_of_first_token,
    tokens_input, tokens_output, tokens_cache_read, tokens_cache_create, tokens_reasoning, tokens_total,
    cost_input_microcents, cost_output_microcents, cost_total_microcents,
    user_id, tags, metadata, models, providers, service_names, simulation_id,
    root_span_id, root_span_name, input_messages, last_input_messages, output_messages, system_instructions,
    retention_days
)
SELECT
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

-- Recreate `sessions_mv` with the same definition the post-00016 schema uses,
-- so live aggregation resumes. Keep this body in lockstep with
-- `00016_session_parity.sql` — divergence would cause new sessions to be
-- aggregated differently than the rebuilt historical ones.
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

-- +goose Down

-- One-time data backfill — `sessions` is fully derived from `spans` via
-- `sessions_mv`, so there is nothing meaningful to roll back to (the
-- pre-backfill rows were the stale state this migration repairs).
-- Intentionally a no-op.
SELECT 1;

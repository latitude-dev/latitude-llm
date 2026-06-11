-- +goose NO TRANSACTION
-- +goose Up

-- Backfill `tools` on sessions/traces rollups — clustered variant.
-- INSERT...SELECT carries no ON CLUSTER: it runs on the node the migration
-- runner connects to, and Replicated* tables propagate the inserted parts
-- to the other replicas.
--
-- Backfill `tools` on sessions/traces rows written before 00025/00026
-- rebuilt the MVs. AggregatingMergeTree merges these partial rows into the
-- existing ones:
--
--   - `tools` is a uniq-array state, so overlap with spans the new MVs
--     already rolled up merges idempotently — safe to run under live ingest,
--     no double counting.
--   - Omitted columns get merge-neutral defaults (sums 0, empty aggregate
--     states, epoch for max-merged DateTimes). The three columns whose
--     defaults are NOT merge-neutral are supplied explicitly:
--       * min_start_time — the default epoch would win every min() merge
--         (and instantly expire the row via TTL). We supply the real min
--         over the matched spans, which is >= the row's existing min, so
--         the merge keeps the existing value.
--       * time_of_first_token — min-merged; supply the far-future "no
--         tokens" sentinel the MVs use instead of the epoch default.
--       * retention_days — max-merged; the default 90 could extend rows
--         from short-retention plans, and 0 would TTL-expire the standalone
--         backfill row before it merges. Supply the real max.
--
-- A backfill row whose min_start_time lands in a later month than the
-- existing row stays unmerged in its own partition; reads stay correct
-- because every read re-aggregates by session/trace id.
--
-- toString(tool_name) pins the state to AggregateFunction(groupUniqArrayIf,
-- String, UInt8) — tool_name is LowCardinality and INSERT...SELECT state
-- types must match the column exactly.

-- `FROM spans AS s` + `s.session_id` mirrors the MV: the bare column would
-- collide with the `session_id` SELECT alias and fail name resolution
-- (code 215) — same pitfall the 00016 GROUP BY comment describes.
INSERT INTO sessions (organization_id, project_id, session_id, min_start_time, time_of_first_token, tools, retention_days)
SELECT
    s.organization_id,
    s.project_id,
    coalesce(nullIf(s.session_id, ''), toString(s.trace_id)) AS session_id,
    min(s.start_time) AS min_start_time,
    toDateTime64('2261-01-01 00:00:00.000000000', 9, 'UTC') AS time_of_first_token,
    groupUniqArrayIfState(toString(s.tool_name), s.tool_name != '') AS tools,
    max(s.retention_days) AS retention_days
FROM spans AS s
WHERE s.operation = 'execute_tool' AND s.tool_name != ''
GROUP BY
    s.organization_id,
    s.project_id,
    coalesce(nullIf(s.session_id, ''), toString(s.trace_id));

INSERT INTO traces (organization_id, project_id, trace_id, min_start_time, time_of_first_token, tools, retention_days)
SELECT
    organization_id,
    project_id,
    trace_id,
    min(start_time) AS min_start_time,
    toDateTime64('2261-01-01 00:00:00.000000000', 9, 'UTC') AS time_of_first_token,
    groupUniqArrayIfState(toString(tool_name), tool_name != '') AS tools,
    max(retention_days) AS retention_days
FROM spans
WHERE operation = 'execute_tool' AND tool_name != ''
GROUP BY
    organization_id,
    project_id,
    trace_id;

-- +goose Down

-- No-op: the backfill only adds tool names into uniq-array states; dropping
-- the column (00025/00026 down) removes the data.
SELECT 1;

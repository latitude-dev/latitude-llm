-- +goose NO TRANSACTION
-- +goose Up

-- Backfill `defined_tools` on sessions/traces rows written before 00031/00032
-- rebuilt the MVs — same scheme as 00027; see that migration for the full
-- merge-semantics notes (idempotent uniq-array unions, why min_start_time /
-- time_of_first_token / retention_days are supplied explicitly).
--
-- Unlike 00027's tools state, `defined_tools` is a SimpleAggregateFunction
-- holding a plain Array(String), so no toString() pinning is needed —
-- Array(LowCardinality(String)) converts implicitly on insert.

-- `FROM spans AS s` + `s.session_id` mirrors the MV: the bare column would
-- collide with the `session_id` SELECT alias and fail name resolution
-- (code 215) — same pitfall the 00016 GROUP BY comment describes.
INSERT INTO sessions (organization_id, project_id, session_id, min_start_time, time_of_first_token, defined_tools, retention_days)
SELECT
    s.organization_id,
    s.project_id,
    coalesce(nullIf(s.session_id, ''), toString(s.trace_id)) AS session_id,
    min(s.start_time) AS min_start_time,
    toDateTime64('2261-01-01 00:00:00.000000000', 9, 'UTC') AS time_of_first_token,
    groupUniqArrayArray(arrayFilter(n -> n != '', s.tool_names)) AS defined_tools,
    max(s.retention_days) AS retention_days
FROM spans AS s
WHERE notEmpty(s.tool_names)
GROUP BY
    s.organization_id,
    s.project_id,
    coalesce(nullIf(s.session_id, ''), toString(s.trace_id));

INSERT INTO traces (organization_id, project_id, trace_id, min_start_time, time_of_first_token, defined_tools, retention_days)
SELECT
    organization_id,
    project_id,
    trace_id,
    min(start_time) AS min_start_time,
    toDateTime64('2261-01-01 00:00:00.000000000', 9, 'UTC') AS time_of_first_token,
    groupUniqArrayArray(arrayFilter(n -> n != '', tool_names)) AS defined_tools,
    max(retention_days) AS retention_days
FROM spans
WHERE notEmpty(tool_names)
GROUP BY
    organization_id,
    project_id,
    trace_id;

-- +goose Down

-- No-op: the backfill only adds tool names into uniq-array unions; dropping
-- the column (00031/00032 down) removes the data.
SELECT 1;

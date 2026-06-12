-- +goose NO TRANSACTION
-- +goose Up

-- Backfill `defined_tools` on sessions/traces rollups — clustered variant.
-- See unclustered/00033_backfill_rollup_defined_tools.sql for the
-- merge-semantics notes.
--
-- INSERT...SELECT carries no ON CLUSTER: it runs on the node the migration
-- runner connects to, and Replicated* tables propagate the inserted parts
-- to the other replicas.
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

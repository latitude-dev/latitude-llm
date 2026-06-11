-- +goose NO TRANSACTION
-- +goose Up

-- Backfill `tools` on sessions/traces rollups — clustered variant.
-- See unclustered/00027_backfill_rollup_tools.sql for the merge-semantics notes.
--
-- INSERT...SELECT carries no ON CLUSTER: it runs on the node the migration
-- runner connects to, and Replicated* tables propagate the inserted parts
-- to the other replicas.

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

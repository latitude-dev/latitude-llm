-- +goose NO TRANSACTION
-- +goose Up

-- Prune the sessions rollup by activity time.
--
-- The rollup's ORDER BY is (organization_id, project_id, session_id), so the
-- session-list and percentile-filter queries can only narrow by the sparse
-- primary index and then had to read every granule of the project's range.
-- A minmax index on max_end_time lets their new activity-cutoff predicate
-- (`max_end_time >= now() - 90d`) skip granules of dormant sessions instead
-- of decompressing them — the bulk of the rollup for a project with history.
-- Granularity 1 mirrors idx_start_time (00034).
ALTER TABLE sessions
    ADD INDEX IF NOT EXISTS idx_end_time max_end_time TYPE minmax GRANULARITY 1;

-- +goose Down

ALTER TABLE sessions
    DROP INDEX IF EXISTS idx_end_time;

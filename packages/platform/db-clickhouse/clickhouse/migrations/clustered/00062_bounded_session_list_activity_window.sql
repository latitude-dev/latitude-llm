-- +goose NO TRANSACTION
-- +goose Up

-- Clustered twin of the unclustered 00062: minmax index on max_end_time so
-- the session-list / percentile-filter activity-cutoff predicate prunes
-- granules of dormant sessions. No MATERIALIZE step — existing parts gain
-- the index as they naturally merge (same deploy-time stance as 00020's
-- `materialize_ttl_after_modify = 0`), new parts carry it from insert.
ALTER TABLE sessions ON CLUSTER default
    ADD INDEX IF NOT EXISTS idx_end_time max_end_time TYPE minmax GRANULARITY 1;

-- +goose Down

ALTER TABLE sessions ON CLUSTER default
    DROP INDEX IF EXISTS idx_end_time;

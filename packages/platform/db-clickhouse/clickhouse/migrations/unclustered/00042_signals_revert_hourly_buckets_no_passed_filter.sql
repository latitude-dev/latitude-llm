-- +goose NO TRANSACTION
-- +goose Up

-- Revert of PR1's 00039: rebuild scores_hourly_buckets back to the pre-cutover rollup that counts
-- all signal_id-bearing scores (no passed filter). Valid again because 00041 reverted the writer's
-- always-stamp invariant (signal_id is present only on matches), so "signal_id present" == occurrence.
-- 00041 ran synchronously (mutations_sync), so the backfill below re-aggregates the reverted rows.
DROP VIEW IF EXISTS scores_hourly_buckets_mv;
DROP TABLE IF EXISTS scores_hourly_buckets;

CREATE TABLE IF NOT EXISTS scores_hourly_buckets
(
    organization_id  LowCardinality(FixedString(24))                CODEC(ZSTD(1)),
    project_id       LowCardinality(FixedString(24))                CODEC(ZSTD(1)),
    signal_id        FixedString(24)                                CODEC(ZSTD(1)),
    ts_hour          DateTime('UTC')                                CODEC(Delta(4), ZSTD(1)),

    count            SimpleAggregateFunction(sum, UInt64)           CODEC(T64, ZSTD(1))
)
ENGINE = AggregatingMergeTree
PARTITION BY toYYYYMM(ts_hour)
PRIMARY KEY (organization_id, project_id, signal_id)
ORDER BY (organization_id, project_id, signal_id, ts_hour);
-- +goose StatementBegin
CREATE MATERIALIZED VIEW IF NOT EXISTS scores_hourly_buckets_mv TO scores_hourly_buckets
AS
SELECT
    organization_id,
    project_id,
    signal_id,
    toStartOfHour(created_at) AS ts_hour,
    count()                    AS count
FROM scores
WHERE signal_id != ''
GROUP BY organization_id, project_id, signal_id, ts_hour;
-- +goose StatementEnd
-- +goose StatementBegin
INSERT INTO scores_hourly_buckets
SELECT
    organization_id,
    project_id,
    signal_id,
    toStartOfHour(created_at) AS ts_hour,
    count()                    AS count
FROM scores
WHERE signal_id != ''
GROUP BY organization_id, project_id, signal_id, ts_hour;
-- +goose StatementEnd

-- +goose Down
-- Restore the PR1 (00039) rollup that counted only occurrences (passed = true).
DROP VIEW IF EXISTS scores_hourly_buckets_mv;
DROP TABLE IF EXISTS scores_hourly_buckets;

CREATE TABLE IF NOT EXISTS scores_hourly_buckets
(
    organization_id  LowCardinality(FixedString(24))                CODEC(ZSTD(1)),
    project_id       LowCardinality(FixedString(24))                CODEC(ZSTD(1)),
    signal_id        FixedString(24)                                CODEC(ZSTD(1)),
    ts_hour          DateTime('UTC')                                CODEC(Delta(4), ZSTD(1)),

    count            SimpleAggregateFunction(sum, UInt64)           CODEC(T64, ZSTD(1))
)
ENGINE = AggregatingMergeTree
PARTITION BY toYYYYMM(ts_hour)
PRIMARY KEY (organization_id, project_id, signal_id)
ORDER BY (organization_id, project_id, signal_id, ts_hour);
-- +goose StatementBegin
CREATE MATERIALIZED VIEW IF NOT EXISTS scores_hourly_buckets_mv TO scores_hourly_buckets
AS
SELECT
    organization_id,
    project_id,
    signal_id,
    toStartOfHour(created_at) AS ts_hour,
    count()                    AS count
FROM scores
WHERE signal_id != '' AND passed = true
GROUP BY organization_id, project_id, signal_id, ts_hour;
-- +goose StatementEnd
-- +goose StatementBegin
INSERT INTO scores_hourly_buckets
SELECT
    organization_id,
    project_id,
    signal_id,
    toStartOfHour(created_at) AS ts_hour,
    count()                    AS count
FROM scores
WHERE signal_id != '' AND passed = true
GROUP BY organization_id, project_id, signal_id, ts_hour;
-- +goose StatementEnd

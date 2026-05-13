-- +goose NO TRANSACTION
-- +goose Up

-- Destination table: per-(org, project, issue) hourly score counts. Powers
-- the seasonal-baseline read path in `escalationSignalsByIssues` so the
-- detector can compare "now" against same (day_of_week, hour) bins from
-- prior weeks without re-scanning raw `scores`. SimpleAggregateFunction(sum)
-- means read queries must re-aggregate with GROUP BY because background
-- merges may not have combined partial rows yet.
CREATE TABLE IF NOT EXISTS scores_hourly_buckets ON CLUSTER default
(
    organization_id  LowCardinality(FixedString(24))                CODEC(ZSTD(1)),
    project_id       LowCardinality(FixedString(24))                CODEC(ZSTD(1)),
    issue_id         FixedString(24)                                CODEC(ZSTD(1)),
    ts_hour          DateTime('UTC')                                CODEC(Delta(4), ZSTD(1)),

    count            SimpleAggregateFunction(sum, UInt64)           CODEC(T64, ZSTD(1))
)
ENGINE = ReplicatedAggregatingMergeTree
PARTITION BY toYYYYMM(ts_hour)
PRIMARY KEY (organization_id, project_id, issue_id)
ORDER BY (organization_id, project_id, issue_id, ts_hour);
-- +goose StatementBegin
CREATE MATERIALIZED VIEW IF NOT EXISTS scores_hourly_buckets_mv ON CLUSTER default TO scores_hourly_buckets
AS
SELECT
    organization_id,
    project_id,
    issue_id,
    toStartOfHour(created_at) AS ts_hour,
    count()                    AS count
FROM scores
WHERE issue_id != ''
GROUP BY organization_id, project_id, issue_id, ts_hour;
-- +goose StatementEnd
-- +goose StatementBegin
-- Backfill from historical scores so day-1 reads of the MV see prior data.
-- Materialized views in ClickHouse are insert-time triggers and DO NOT
-- replay history; this INSERT is the only way to seed past rows.
INSERT INTO scores_hourly_buckets
SELECT
    organization_id,
    project_id,
    issue_id,
    toStartOfHour(created_at) AS ts_hour,
    count()                    AS count
FROM scores
WHERE issue_id != ''
GROUP BY organization_id, project_id, issue_id, ts_hour;
-- +goose StatementEnd

-- +goose Down
DROP VIEW IF EXISTS scores_hourly_buckets_mv ON CLUSTER default;
DROP TABLE IF EXISTS scores_hourly_buckets ON CLUSTER default;

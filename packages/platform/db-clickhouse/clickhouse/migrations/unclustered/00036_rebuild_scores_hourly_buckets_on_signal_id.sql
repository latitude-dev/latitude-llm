-- +goose NO TRANSACTION
-- +goose Up

-- Signals rename: rebuild the per-(org, project, signal) hourly count rollup keyed on
-- signal_id (was issue_id). Drop + recreate the MV and its destination, then backfill.
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
-- Backfill from historical scores. The if(signal_id, issue_id) fallback covers rows whose
-- signal_id backfill mutation (migration 00035) has not finished merging yet.
INSERT INTO scores_hourly_buckets
SELECT
    organization_id,
    project_id,
    if(signal_id != '', signal_id, issue_id) AS signal_id,
    toStartOfHour(created_at)                AS ts_hour,
    count()                                  AS count
FROM scores
WHERE if(signal_id != '', signal_id, issue_id) != ''
GROUP BY organization_id, project_id, signal_id, ts_hour;
-- +goose StatementEnd

-- +goose Down
DROP VIEW IF EXISTS scores_hourly_buckets_mv;
DROP TABLE IF EXISTS scores_hourly_buckets;

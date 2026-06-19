-- +goose NO TRANSACTION
-- +goose Up

-- Signals cutover: scores_hourly_buckets (00036) counted every signal_id-bearing score. After the
-- always-stamp-signal_id writer, that now includes non-matching evaluation runs, so the rollup
-- over-counts occurrences. Rebuild it to count only occurrences (passed = true). The preceding flip
-- migration (00038) runs synchronously, so the backfill below re-aggregates already-flipped rows.
DROP VIEW IF EXISTS scores_hourly_buckets_mv ON CLUSTER default;
DROP TABLE IF EXISTS scores_hourly_buckets ON CLUSTER default;

CREATE TABLE IF NOT EXISTS scores_hourly_buckets ON CLUSTER default
(
    organization_id  LowCardinality(FixedString(24))                CODEC(ZSTD(1)),
    project_id       LowCardinality(FixedString(24))                CODEC(ZSTD(1)),
    signal_id        FixedString(24)                                CODEC(ZSTD(1)),
    ts_hour          DateTime('UTC')                                CODEC(Delta(4), ZSTD(1)),

    count            SimpleAggregateFunction(sum, UInt64)           CODEC(T64, ZSTD(1))
)
ENGINE = ReplicatedAggregatingMergeTree
PARTITION BY toYYYYMM(ts_hour)
PRIMARY KEY (organization_id, project_id, signal_id)
ORDER BY (organization_id, project_id, signal_id, ts_hour);
-- +goose StatementBegin
CREATE MATERIALIZED VIEW IF NOT EXISTS scores_hourly_buckets_mv ON CLUSTER default TO scores_hourly_buckets
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

-- +goose Down
-- Restore the pre-cutover rollup that counted all signal_id-bearing scores (no passed filter).
DROP VIEW IF EXISTS scores_hourly_buckets_mv ON CLUSTER default;
DROP TABLE IF EXISTS scores_hourly_buckets ON CLUSTER default;

CREATE TABLE IF NOT EXISTS scores_hourly_buckets ON CLUSTER default
(
    organization_id  LowCardinality(FixedString(24))                CODEC(ZSTD(1)),
    project_id       LowCardinality(FixedString(24))                CODEC(ZSTD(1)),
    signal_id        FixedString(24)                                CODEC(ZSTD(1)),
    ts_hour          DateTime('UTC')                                CODEC(Delta(4), ZSTD(1)),

    count            SimpleAggregateFunction(sum, UInt64)           CODEC(T64, ZSTD(1))
)
ENGINE = ReplicatedAggregatingMergeTree
PARTITION BY toYYYYMM(ts_hour)
PRIMARY KEY (organization_id, project_id, signal_id)
ORDER BY (organization_id, project_id, signal_id, ts_hour);
-- +goose StatementBegin
CREATE MATERIALIZED VIEW IF NOT EXISTS scores_hourly_buckets_mv ON CLUSTER default TO scores_hourly_buckets
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

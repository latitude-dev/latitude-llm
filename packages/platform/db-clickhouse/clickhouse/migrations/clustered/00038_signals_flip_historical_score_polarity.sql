-- +goose NO TRANSACTION
-- +goose Up

-- Signals cutover: a signal's occurrences are now its matching scores (passed = true = the behavior
-- is present in the trace). Existing evaluation + annotation scores were written under the old
-- problem-detector polarity (passed = false = exhibits), so flip them once to the new convention.
-- Errored rows are left alone: errored is never an occurrence (passed stays false). Mirrors the
-- Postgres flip in drizzle/20260618140517_signals-flip-historical-score-polarity. The CH column is
-- still named `source` (the rename to source_type is Postgres-only; CH keeps `source` per the
-- sort-key constraint). mutations_sync = 2 makes the flip complete on all replicas before the next
-- migration (00039) rebuilds scores_hourly_buckets, so that rebuild re-aggregates the flipped rows.
ALTER TABLE scores ON CLUSTER default UPDATE passed = NOT passed
  WHERE source IN ('evaluation', 'annotation') AND errored = false
  SETTINGS mutations_sync = 2;

-- +goose Down
-- Best-effort reverse: re-flip to the old polarity (symmetric for rows present at Up time).
ALTER TABLE scores ON CLUSTER default UPDATE passed = NOT passed
  WHERE source IN ('evaluation', 'annotation') AND errored = false;

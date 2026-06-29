-- +goose NO TRANSACTION
-- +goose Up

-- Mirror the Postgres `scores.annotator_id` (the user who authored a score) so
-- traces/sessions can be filtered by annotation author. Only human annotations
-- carry a value; evaluation/system rows sync as '' (DEFAULT). No backfill: the
-- annotator only exists in Postgres, so historical CH rows stay '' until a
-- separate Postgres-sourced ALTER ... UPDATE backfill is run.
-- Column and index in a SINGLE ALTER: on a Replicated table two back-to-back
-- `ALTER ... ON CLUSTER` statements race the metadata version, and the ADD INDEX
-- fails with code 517 ("replica doesn't catch up with latest ALTER") because the
-- replica hasn't applied the ADD COLUMN's bump yet. One ALTER = one metadata bump.
ALTER TABLE scores ON CLUSTER default
  ADD COLUMN IF NOT EXISTS annotator_id FixedString(24) DEFAULT '' CODEC(ZSTD(1)),
  ADD INDEX IF NOT EXISTS idx_annotator_id annotator_id TYPE bloom_filter(0.01) GRANULARITY 2;

-- +goose Down
-- Single ALTER for the same reason as Up: two sequential DROPs would race the
-- replicated metadata version (code 517) on rollback.
ALTER TABLE scores ON CLUSTER default
  DROP INDEX IF EXISTS idx_annotator_id,
  DROP COLUMN IF EXISTS annotator_id;

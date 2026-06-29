-- +goose NO TRANSACTION
-- +goose Up

-- Mirror the Postgres `scores.annotator_id` (the user who authored a score) so
-- traces/sessions can be filtered by annotation author. Only human annotations
-- carry a value; evaluation/system rows sync as '' (DEFAULT). No backfill: the
-- annotator only exists in Postgres, so historical CH rows stay '' until a
-- separate Postgres-sourced ALTER ... UPDATE backfill is run.
-- Column + index in a SINGLE ALTER to match the clustered variant, which must
-- combine them to avoid a replicated-metadata race (code 517) between two ALTERs.
ALTER TABLE scores
  ADD COLUMN IF NOT EXISTS annotator_id FixedString(24) DEFAULT '' CODEC(ZSTD(1)),
  ADD INDEX IF NOT EXISTS idx_annotator_id annotator_id TYPE bloom_filter(0.01) GRANULARITY 2;

-- +goose Down
-- Single ALTER to match the clustered variant (avoids the rollback metadata race).
ALTER TABLE scores
  DROP INDEX IF EXISTS idx_annotator_id,
  DROP COLUMN IF EXISTS annotator_id;

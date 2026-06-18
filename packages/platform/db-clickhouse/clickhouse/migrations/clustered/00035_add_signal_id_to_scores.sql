-- +goose NO TRANSACTION
-- +goose Up

-- Signals (was Issues): add signal_id alongside issue_id. New rows dual-write both;
-- this backfills historical rows. issue_id is kept until a later cleanup phase.
-- The column and index are added in a SINGLE ALTER: on a Replicated table two
-- back-to-back `ALTER ... ON CLUSTER` statements race the metadata version, and the
-- ADD INDEX fails with code 517 ("replica doesn't catch up with latest ALTER") because
-- the replica hasn't applied the ADD COLUMN's bump yet. One ALTER = one metadata bump.
ALTER TABLE scores ON CLUSTER default
  ADD COLUMN IF NOT EXISTS signal_id FixedString(24) DEFAULT '' CODEC(ZSTD(1)),
  ADD INDEX IF NOT EXISTS idx_signal_id signal_id TYPE bloom_filter(0.01) GRANULARITY 2;
-- Async mutation: existing rows backfill in the background; reads tolerate the window via
-- dual-write (new rows) + the if(signal_id, issue_id) fallback in the MV backfill below.
ALTER TABLE scores ON CLUSTER default UPDATE signal_id = issue_id WHERE issue_id != '';

-- +goose Down
-- Single ALTER for the same reason as Up: two sequential DROPs would race the
-- replicated metadata version (code 517) on rollback.
ALTER TABLE scores ON CLUSTER default
  DROP INDEX IF EXISTS idx_signal_id,
  DROP COLUMN IF EXISTS signal_id;

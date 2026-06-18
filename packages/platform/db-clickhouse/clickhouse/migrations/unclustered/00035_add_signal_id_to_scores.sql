-- +goose NO TRANSACTION
-- +goose Up

-- Signals (was Issues): add signal_id alongside issue_id. New rows dual-write both;
-- this backfills historical rows. issue_id is kept until a later cleanup phase.
-- Column + index in a SINGLE ALTER to match the clustered variant, which must combine
-- them to avoid a replicated-metadata race (code 517) between two sequential ALTERs.
ALTER TABLE scores
  ADD COLUMN IF NOT EXISTS signal_id FixedString(24) DEFAULT '' CODEC(ZSTD(1)),
  ADD INDEX IF NOT EXISTS idx_signal_id signal_id TYPE bloom_filter(0.01) GRANULARITY 2;
-- Async mutation: existing rows backfill in the background; reads tolerate the window via
-- dual-write (new rows) + the if(signal_id, issue_id) fallback in the MV backfill below.
ALTER TABLE scores UPDATE signal_id = issue_id WHERE issue_id != '';

-- +goose Down
-- Single ALTER to match the clustered variant (avoids the rollback metadata race).
ALTER TABLE scores
  DROP INDEX IF EXISTS idx_signal_id,
  DROP COLUMN IF EXISTS signal_id;

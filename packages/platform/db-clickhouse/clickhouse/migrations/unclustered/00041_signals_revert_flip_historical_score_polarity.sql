-- +goose NO TRANSACTION
-- +goose Up

-- Revert of the Signals PR1 (#3621) polarity flip in ClickHouse, back to the original
-- problem-detector convention (passed = false = behavior present). The CH column is still
-- named `source` (the rename to source_type is Postgres-only). mutations_sync = 1 makes each
-- mutation complete locally before the next, so migration 00042 rebuilds scores_hourly_buckets
-- over fully-reverted rows.

-- (A) evaluation + flagger (source_id = 'SYSTEM') annotation scores: re-flip all (errored excluded).
ALTER TABLE scores UPDATE passed = NOT passed
  WHERE errored = false AND (source = 'evaluation' OR (source = 'annotation' AND source_id = 'SYSTEM'))
  SETTINGS mutations_sync = 1;

-- (B) human annotations (source_id != 'SYSTEM'): passed is sentiment, write path unchanged by PR1;
-- only the rows the one-time PR1 migration touched (created before the v0.3.11 deploy) were inverted.
ALTER TABLE scores UPDATE passed = NOT passed
  WHERE errored = false AND source = 'annotation' AND source_id != 'SYSTEM' AND created_at < '2026-06-19 12:50:49'
  SETTINGS mutations_sync = 1;

-- (C) restore the 'signal_id only on matches' invariant: clear signal_id from non-occurrence
-- evaluation rows (after the re-flip, occurrence = passed = false).
ALTER TABLE scores UPDATE signal_id = ''
  WHERE source = 'evaluation' AND (passed = true OR errored = true)
  SETTINGS mutations_sync = 1;

-- +goose Down
-- Best-effort reverse (dev only): re-flip passed to the PR1 polarity. The signal_id cleared in (C)
-- cannot be reconstructed here, so it is not restored.
ALTER TABLE scores UPDATE passed = NOT passed
  WHERE errored = false AND (source = 'evaluation' OR (source = 'annotation' AND source_id = 'SYSTEM'))
  SETTINGS mutations_sync = 1;
ALTER TABLE scores UPDATE passed = NOT passed
  WHERE errored = false AND source = 'annotation' AND source_id != 'SYSTEM' AND created_at < '2026-06-19 12:50:49'
  SETTINGS mutations_sync = 1;

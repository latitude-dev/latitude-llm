-- +goose NO TRANSACTION
-- +goose Up

-- Revert of the Signals PR1 (#3621) polarity flip in ClickHouse, back to the original
-- problem-detector convention (passed = false = behavior present). The CH column is still
-- named `source` (the rename to source_type is Postgres-only). mutations_sync = 2 makes each
-- mutation complete on all replicas before the next, so migration 00042 rebuilds
-- scores_hourly_buckets over fully-reverted rows.

-- (A) evaluation + flagger (source_id = 'SYSTEM') annotation scores were written uniformly in the
-- new polarity (evals via the legacy-polarity boundary inversion, flaggers via the flipped default)
-- and the one-time PR1 flip touched the pre-cutover ones. Re-flip all. Errored rows are left alone.
ALTER TABLE scores ON CLUSTER default UPDATE passed = NOT passed
  WHERE errored = false AND (source = 'evaluation' OR (source = 'annotation' AND source_id = 'SYSTEM'))
  SETTINGS mutations_sync = 2;

-- (B) human annotations (source_id != 'SYSTEM') use `passed` as a sentiment attribute; PR1 never
-- changed that write path, so rows created after the v0.3.11 deploy are already correct. Re-flip
-- only the rows the one-time PR1 migration touched (created before it ran in production).
ALTER TABLE scores ON CLUSTER default UPDATE passed = NOT passed
  WHERE errored = false AND source = 'annotation' AND source_id != 'SYSTEM' AND created_at < '2026-06-19 12:50:49'
  SETTINGS mutations_sync = 2;

-- (C) restore the 'signal_id only on matches' invariant: PR1 always-stamped signal_id on every
-- evaluation run. After the re-flip an occurrence is passed = false, so clear signal_id from the
-- non-occurrence evaluation rows (passed = true or errored). Annotations keep their signal_id.
ALTER TABLE scores ON CLUSTER default UPDATE signal_id = ''
  WHERE source = 'evaluation' AND (passed = true OR errored = true)
  SETTINGS mutations_sync = 2;

-- +goose Down
-- Best-effort reverse (dev only): re-flip passed to the PR1 polarity. The signal_id cleared in (C)
-- cannot be reconstructed here (PR1 stamped it from each run's evaluation), so it is not restored.
ALTER TABLE scores ON CLUSTER default UPDATE passed = NOT passed
  WHERE errored = false AND (source = 'evaluation' OR (source = 'annotation' AND source_id = 'SYSTEM'))
  SETTINGS mutations_sync = 2;
ALTER TABLE scores ON CLUSTER default UPDATE passed = NOT passed
  WHERE errored = false AND source = 'annotation' AND source_id != 'SYSTEM' AND created_at < '2026-06-19 12:50:49'
  SETTINGS mutations_sync = 2;
